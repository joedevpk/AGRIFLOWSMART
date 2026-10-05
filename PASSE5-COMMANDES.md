# Passe 5 — Panier, checkout, commandes, paiement, livraison

## Architecture
- Panier : état local (contexte + localStorage, par compte, fusion du panier invité à la connexion).
  Prix, stock et disponibilité sont relus en base ; le navigateur n'est jamais la source de vérité.
- Création de commande : RPC transactionnelle `create_order_from_cart` (revalidation produits/stock/prix,
  total recalculé, une commande par producteur, décrément du stock, paiement + livraison + historique +
  notification, idempotence par `checkout_id`).
- Statuts : RPC `transition_order_status` (transitions contrôlées par rôle), `confirm_cash_payment`.
- Écritures directes sur `orders`, `order_status_history`, `deliveries` supprimées (RLS + triggers).
- Paiement : AUCUN prestataire réel. Mobile Money / carte = démonstration (`is_demo`). Paiement à la
  livraison confirmé par le producteur. `apply_provider_payment_event` = point d'entrée futur (service_role).
- Livraison : frais à 0 « à confirmer », aucune distance ni date inventée.

## À faire avant mise en production
1. Appliquer `supabase/migrations/20260924120000_cart_checkout_orders_payments.sql` sur une base de TEST.
   Cette migration n'a été vérifiée que par relecture (aucun PostgreSQL disponible lors de la passe).
2. `npm install && npm run typecheck && npm run lint && npm run build`
   (non exécutés lors de la passe : registre npm inaccessible ; seul un typecheck partiel avec stubs a été fait).
3. Tester le parcours : ajout panier → checkout → commande → confirmation producteur → livraison → clôture,
   ainsi que double clic, stock insuffisant, changement de prix et annulation.

## Limites connues
- Anciennes commandes : le paiement « démo » depuis la page de détail n'existe plus.
- BottomNav inchangée (5 éléments) : le panier est dans le Header.
- Le bouton favoris de la fiche produit reste factice (antérieur à cette passe).
