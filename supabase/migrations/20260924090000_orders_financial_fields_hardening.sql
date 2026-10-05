/*
# AgriFlow RDC — Durcissement des champs financiers de `orders`

## Contexte
La policy `orders_participant_update` (migration `create_core_schema.sql`) autorise
l'acheteur ET le producteur à modifier n'importe quelle colonne d'une commande dont
ils sont participants — seuls `buyer_id` / `producer_id` / `product_id` sont déjà
verrouillés par le trigger `protect_order_core_fields` (migration
`auth_roles_rls_hardening.sql`).

Rien n'empêchait donc, via un appel direct à l'API REST Supabase (en dehors du flux
`handlePayment` du frontend), un participant de modifier lui-même :
- `total_amount` ou `currency` (falsification du montant dû),
- `payment_status` (s'auto-déclarer `paid` sans paiement réel),
- `payment_method` sans passer par un paiement.

## Ce que fait cette migration
Ajoute un trigger `protect_order_financial_fields` qui, pour tout utilisateur non-admin :
1. Interdit toute modification de `total_amount` et `currency` après création.
2. N'autorise le changement de `payment_status` que dans le seul cas légitime existant
   côté produit : `pending -> demo_paid`, et uniquement par l'acheteur de la commande
   (reproduit exactement ce que fait `OrderDetailPage.handlePayment`). Tout autre
   changement (ex. passage direct à `paid`/`failed`, ou changement par le producteur)
   est rejeté.
3. N'autorise le changement de `payment_method` que dans ce même cas (passage à
   `demo_paid` par l'acheteur).
4. Un admin garde la main pour corriger une commande (remboursement, litige, etc.),
   conformément à la policy `orders_admin_all` déjà en place.

Cette migration N'AJOUTE AUCUN DROP destructif et ne touche à aucune donnée existante.
Elle ne change ni la policy RLS `orders_participant_update`, ni le workflow de statut
de commande (`status`), qui restent inchangés.
*/

CREATE OR REPLACE FUNCTION protect_order_financial_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN
    RAISE EXCEPTION 'Modification du montant de la commande non autorisée';
  END IF;

  IF NEW.currency IS DISTINCT FROM OLD.currency THEN
    RAISE EXCEPTION 'Modification de la devise de la commande non autorisée';
  END IF;

  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    IF NOT (
      OLD.payment_status = 'pending'
      AND NEW.payment_status = 'demo_paid'
      AND auth.uid() = OLD.buyer_id
    ) THEN
      RAISE EXCEPTION 'Modification du statut de paiement non autorisée';
    END IF;
  END IF;

  IF NEW.payment_method IS DISTINCT FROM OLD.payment_method THEN
    IF NOT (auth.uid() = OLD.buyer_id AND NEW.payment_status = 'demo_paid') THEN
      RAISE EXCEPTION 'Modification du mode de paiement non autorisée';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_protect_order_financial_fields ON orders;
CREATE TRIGGER trg_protect_order_financial_fields
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION protect_order_financial_fields();
