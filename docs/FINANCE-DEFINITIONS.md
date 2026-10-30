# Définitions des indicateurs financiers (passe 2)

Source de vérité : fonctions SQL `admin_finance_*` (migration `20261010090000_finance_dashboard.sql`). Le navigateur n'additionne rien.

**Règles communes.** Période = `[début, fin[` (début inclus, fin exclue). Jours, semaines (ISO, lundi) et mois sont calculés en **heure de Kinshasa (UTC+1)**.
Une seule devise à la fois : les devises ne sont jamais additionnées. Les paiements de démonstration (`is_demo` / `demo_paid`) sont exclus de tous les indicateurs et comptés à part.

| Indicateur | Définition | Date de référence | Ce que ce n'est PAS |
|---|---|---|---|
| Commandes (nombre, valeur) | Commandes créées, hors annulées ; valeur = total acheteur | création de la commande | de l'argent encaissé |
| Commandes annulées | Commandes au statut `cancelled` | création | — |
| Argent encaissé | Σ montants des paiements réels `paid` ou `refunded` (livraison comprise) | `paid_at` | un revenu de la plateforme : l'essentiel revient aux producteurs |
| Remboursé | Σ remboursements `completed` | dernière mise à jour du remboursement | une demande de remboursement (les demandes ouvertes sont comptées à part) |
| Net encaissé | Encaissé − remboursé | — | un bénéfice |
| Commission acquise | Σ `platform_fee` − Σ `commission_reversed` des commandes payées dans la période (`computed`, `legacy`) | `paid_at` | un bénéfice net : montant brut, avant frais de paiement et charges |
| Net estimé dû aux producteurs | Solde à date des commandes payées au règlement `pending` : `seller_amount` − part remboursée nette de la commission annulée | état courant (indépendant de la période) | un reversement effectué : aucun reversement n'est automatisé |
| Frais de livraison | Σ `delivery_fee` des commandes non annulées, séparés de la commission | création | — (vaut 0 tant que la livraison n'est pas tarifiée) |
| Paiements en attente / échoués | Paiements `pending`+`processing` / `failed`+`cancelled`+`expired` | création du paiement | — |
| Bénéfice net | **Non disponible** : aucune donnée de coûts ni de frais de paiement | — | — |
| Frais de paiement | **Non disponibles** : non récupérés du prestataire | — | — |
| Reversements | **Non disponibles** : fonctionnalité inexistante | — | — |

**Commission « ancienne méthode » (`legacy`).** Les commandes payées avant la passe 1 sont incluses dans « commission acquise » avec le montant alors enregistré (ancien calcul, taux non tracé, assiette incluant la livraison).

**Signaux de contrôle (jamais corrigés automatiquement).** `payment_order_mismatch`, `order_paid_without_payment`, `amount_mismatch`, `currency_mismatch`, `commission_mismatch`, `net_mismatch`, `refund_total_mismatch`, `missing_ledger_event`, `refund_stuck` (> 24 h), `payment_stale` (paiement `processing` > 2 h), `paid_without_commission_rule` (information).
