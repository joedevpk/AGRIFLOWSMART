# Architecture — AgriFlow RDC

## Pile (inchangée)
React 18 + TypeScript + Vite + React Router + Tailwind · Supabase (PostgreSQL, Auth, RLS, Storage, Edge Functions) · CinetPay · Resend (optionnel).
Hébergement frontend : Render Static Site. Le navigateur ne parle qu'à Supabase (clé anon + RLS) et aux Edge Functions.

## Répartition des responsabilités
| Couche | Rôle | Fichiers clés |
|---|---|---|
| Pages / composants | Affichage, états chargement/erreur/vide/succès | `src/pages`, `src/components` |
| Services | Accès Supabase, retours `ServiceResult` (jamais d'exception brute) | `src/services/*` |
| Logique pure | Calculs testés sans réseau (panier, filtres, confirmation, états de paiement) | `src/lib/*` + `*.test.ts` |
| Colonnes SQL | Listes explicites (aucun `select('*')` hors `privacyService`) | `src/lib/columns.ts` |
| Pagination | `range()` + 1 ligne d'avance, tailles centralisées | `src/lib/pagination.ts` |
| Base de données | Vérité métier : statuts, montants, stock, délais, remboursements | `supabase/migrations/*` (RPC `SECURITY DEFINER`) |
| Edge Functions | Paiement CinetPay, webhook, cron | `supabase/functions/*` (+ `_shared/http.ts` : appels externes bornés) |

**Règle** : le navigateur n'est jamais source de vérité pour un prix, un stock, un statut, un paiement ou un remboursement. Aucune écriture directe sur
`orders`, `payments`, `refunds`, `order_events` (testé : `payment-states.test.ts` côté code, `40_security_rls.sql` côté base).

## Machines à états (inchangées, séparées)
`orders.status` : pending → confirmed → preparing → ready → in_delivery → delivered → completed, ou cancelled (avec `cancel_reason`).
`orders.payment_status` : pending, processing, paid, failed, cancelled, expired, refunded, demo_paid (historique). Aucun composant ne les mélange (test automatique).
Une commande « en attente de confirmation du producteur » = `status = pending` avec `confirmation_deadline`.

## Flux paiement (Mobile Money / carte)
1. `payment-initiate` (JWT) → RPC `payment_initiate_begin` : montant, devise et commande relus **en base** ; **bail d'initiation de 90 s** (une seule requête peut appeler CinetPay) ; clé d'idempotence.
2. Appel CinetPay (timeout 10 s, **sans retry**) → `payment_provider_attach` (URL de paiement, statut `processing`, libère le bail). Échec → bail libéré, message clair.
3. Webhook CinetPay → signature HMAC → **revérification auprès de CinetPay** (montant, devise, statut, 1 retry borné) → RPC `payment_apply_result` (idempotente par `provider_event_id` ; refuse `paid` sans montant ET devise).
4. `paid` : la commande reste `pending`, l'échéance démarre, le producteur est notifié (il confirme ou la commande expire). Webhook perdu : la page de résultat (`payment-verify`) et la **réconciliation du cron** rattrapent.
5. Commande annulée/expirée alors que `paid` : `refunds.status = 'requested'` (un seul actif par paiement) → traité par l'admin ; « remboursé » seulement après confirmation.

## Flux confirmation producteur — voir `docs/PASSE23-CONFIRMATION.md` et `docs/CRON.md`.

## Sécurité (résumé)
RLS sur toutes les tables ; `profiles.phone` non lisible par colonne (RPC contrôlée) ; `last_seen_at` illisible et non falsifiable ; fonctions internes sans `EXECUTE` pour anon/authenticated ;
Storage : écriture limitée à `<user_id>/`, 5 Mo et JPEG/PNG/WebP **imposés par le service de stockage** (le frontend vérifie en plus taille, extension, signature binaire, dimensions) ;
CORS des fonctions limité à `FRONTEND_URL` ; aucune clé secrète dans le bundle (contrôle en CI) ; logs masqués.
Tests : `supabase/tests/40_security_rls.sql` (59 assertions : anon, acheteur/producteur croisés, élévation de privilège, paiement, tiers, téléphone, notifications, storage, messages).

## Performance et index
Marketplace : filtres traduits en conditions SQL, page de 24 + « Voir plus » (plus de chargement de toute la table), recherche avec debounce 300 ms et requêtes périmées ignorées.
Listes commandes / produits / notifications / admin : pagination par `range()`. Compteurs inutiles supprimés (mise à jour locale après « marquer comme lu »).
Index (migration `20261001090000`) — chacun répond à une requête réelle :
| Index | Requête servie |
|---|---|
| `products (created_at DESC, id) WHERE status='available'` | marketplace, tri récent |
| `products (price, created_at DESC, id) WHERE status='available'` | marketplace, tri par prix |
| `products (user_id, created_at DESC, id)` | « mes produits » + policies RLS sur `user_id` (aucun index n'existait) |
| `orders (buyer_id, created_at DESC, id DESC)` / `(producer_id, …)` | listes de commandes paginées (remplacent `idx_orders_buyer/producer`) |
| `orders (confirmation_deadline) WHERE status='pending'` (passe 23) | cron : rappels / expiration |
| `notifications (user_id, created_at DESC, id DESC)` + `(user_id, is_read, created_at DESC)` | liste paginée, compteur non lues |
| `payments (order_id, created_at DESC)` | dernier paiement d'une commande |
| `order_status_history (order_id, created_at)` | timeline |
| `buyer_requests (user_id, created_at DESC)`, `(created_at DESC) WHERE status='open'` | mes demandes, demandes ouvertes |
| `refunds (order_id, created_at DESC)`, `(payment_id)` | détail commande, contrôle anti-doublon |
Supprimés car redondants (préfixe d'un composite ou doublon strict) : `idx_orders_buyer`, `idx_orders_producer`, `idx_notif_user`, `idx_notif_read`, `idx_payments_order`, `idx_history_order`, `idx_delivery_order`, `idx_fav_user`.
**Non mesuré** : aucun `EXPLAIN ANALYZE` sur des volumes réels (base vide en test) ; les index sont justifiés par les requêtes, pas par un benchmark.
Non couvert : la recherche utilise `imatch` (regex) — sans index trigramme, elle parcourt les produits `available` ; acceptable pour des milliers de lignes, à revoir (`pg_trgm`) au-delà.
