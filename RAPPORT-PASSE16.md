# AgriFlow RDC — Rapport final : paiement réel (Passe 16)

Ce rapport suit les 17 points demandés. Le détail technique complet est dans
`docs/PAYMENTS.md` ; ce fichier est le résumé exécutif + la checklist honnête
de ce qui reste à faire avant une vraie mise en production.

## 1. Fournisseur intégré
**CinetPay**, seul demandé. Endpoints officiels (`/v2/payment`,
`/v2/payment/check`, notification `x-token` HMAC) intégrés selon la
documentation consultée pour cette implémentation — aucun endpoint/paramètre
inventé.

## 2. Méthodes disponibles
**Aucune n'est câblée en dur.** `payment_settings.enabled_methods` /
`method_currencies` en base décident, et **par défaut à l'installation de
cette migration, seul `cash_on_delivery` est activé** — Mobile Money/carte
restent désactivés tant qu'un admin ne les active pas explicitement via
`admin_update_payment_settings` (après validation du compte marchand réel,
voir §11). Le frontend lit cette configuration via `get_payment_methods()`.

## 3. Tables utilisées
`payments` (étendue), `orders` (étendue), `order_items` (inchangée, snapshot
déjà correct), `deliveries` (inchangée). Nouvelles : `payment_settings`,
`payment_events`, `refunds`.

## 4. Migrations
Une seule nouvelle migration : `supabase/migrations/20260927120000_real_payments_cinetpay.sql`.
Aucun `DROP` destructif ; l'ancien statut `demo_paid` reste lisible dans les
contraintes CHECK pour l'historique, mais plus aucune écriture ne le produit.

## 5. Edge Functions
`payment-initiate`, `payment-webhook`, `payment-verify`, `payment-refund`
(`supabase/functions/*`), + modules partagés `_shared/cinetpay.ts`,
`_shared/supabaseAdmin.ts`, `_shared/http.ts`. Aucun secret dans le frontend :
vérifié par relecture manuelle (aucun `VITE_CINETPAY_*`, aucune clé en dur).

## 6. Webhooks
`payment-webhook` : vérifie le HMAC (`x-token`), rappelle systématiquement
`/v2/payment/check` (jamais confiance au seul body), applique le résultat via
`payment_apply_result` (idempotente), répond toujours HTTP 200.

## 7. RLS
Auditée et étendue (voir §37 du cahier des charges) :
- `payments`, `orders` : aucune policy UPDATE pour un utilisateur non-admin —
  seules les fonctions `SECURITY DEFINER` (propriétaire) peuvent écrire.
- `payment_events` : lecture admin uniquement, écriture uniquement via
  fonctions.
- `payment_settings` : lecture/écriture admin uniquement ; lecture publique
  restreinte via `get_payment_methods()` (n'expose pas la commission).
- `refunds` : lecture participant (acheteur/producteur de la commande) +
  admin ; écriture via `request_refund`/`admin_process_refund`.

## 8. Variables d'environnement
`.env.example` (frontend, aucun secret) et
`supabase/functions/.env.example` (secrets serveur : `CINETPAY_API_KEY`,
`CINETPAY_SITE_ID`, `CINETPAY_SECRET_KEY`, `CINETPAY_BASE_URL`,
`FRONTEND_URL`). `.gitignore` ajouté (absent du projet jusqu'ici) pour exclure
tout `.env*`.

## 9. Flux checkout
`CheckoutPage` revalide toujours côté serveur (inchangé depuis la Passe 5) ;
la commande est créée avec `payment_status = 'pending'` **quelle que soit la
méthode** (suppression du chemin `demo_paid`). `CheckoutConfirmationPage`
propose ensuite « Payer maintenant » pour chaque commande en ligne encore
impayée (une commande = un producteur = un paiement CinetPay ; un panier
multi-producteurs génère plusieurs paiements distincts, un par commande).

## 10. Flux paiement
`payment-initiate` (idempotent) → CinetPay → redirection navigateur vers
l'URL hébergée → retour sur `/payment/result/:reference` → cette page
n'affirme jamais elle-même un succès : elle appelle `payment-verify` puis lit
l'état réel en base, avec un polling borné (15 tentatives, 4 s d'intervalle).
Le webhook reste la source principale ; `payment-verify` est le mécanisme de
secours.

## 11. Flux commande
`payment_apply_result` confirme automatiquement la commande
(`pending → confirmed`) dès que le paiement est vérifié `paid`. Pour le
paiement à la livraison, le producteur confirme manuellement l'encaissement
après livraison (`confirm_cash_payment`), inchangé dans son principe mais
aligné sur les nouveaux statuts et le calcul de commission.

## 12. Gestion des erreurs
Résumée dans `docs/PAYMENTS.md` §10 : API indisponible, montant/devise
incohérents (rejet explicite, aucune confirmation), webhook dupliqué
(idempotent), statut intermédiaire `WAITING_FOR_CUSTOMER` (jamais traité comme
un échec), paiement déjà confirmé (ne régresse jamais), réseau lent (polling
borné, jamais infini).

## 13. Gestion du remboursement
Cycle manuel tracé (`refunds` : `requested → processing → completed/failed`),
car **CinetPay n'expose pas d'API de remboursement automatique documentée**
pour le Mobile Money en RDC au moment de cette implémentation. Aucune
prétention d'automatisation qui n'existe pas — voir `docs/PAYMENTS.md` §5.

## 14. Gestion du settlement
`orders.platform_fee` / `seller_amount` / `settlement_status` calculés à la
confirmation du paiement. **Le virement réel au producteur (payout) n'est PAS
implémenté** — CinetPay ne propose pas de split payment natif vers un compte
producteur tiers dans cette intégration. Ne jamais annoncer un règlement
producteur automatique tant que ce point n'est pas traité séparément (voir
`docs/PAYMENTS.md` §8).

## 15. Tests réalisés
- Relecture manuelle complète du SQL (comptage des `BEGIN`/`END`/`$$`,
  cohérence des noms de colonnes avec le schéma existant).
- `supabase/tests/10_e2e_order_lifecycle.sql` mis à jour pour simuler le
  nouveau parcours (ouverture de paiement, attache prestataire, webhook
  accepté, rejeu du même événement webhook → idempotence vérifiée par
  construction du script).
- Relecture manuelle de tous les fichiers frontend modifiés/créés (imports,
  exports, types, props des composants UI).
- **Non réalisé, et à faire avant toute mise en production** : exécution
  réelle de ce script contre un Postgres (aucun `psql`/serveur Postgres
  disponible dans cet environnement de développement), et tout test contre un
  vrai compte sandbox CinetPay (aucun accès réseau sortant disponible ici).

## 16. Résultat du build
**Non vérifiable depuis cet environnement** : l'accès réseau sortant est
bloqué (`npm install` échoue avec `403 host_not_allowed` sur le registre
npm), donc `node_modules` n'a pas pu être installé et
`npm run typecheck && npm run lint && npm run build` n'ont pas pu être
exécutés réellement ici. **Vous devez lancer ces trois commandes vous-même**
avant tout déploiement — c'est une étape obligatoire que je n'ai pas pu
accomplir à votre place cette fois-ci. J'ai fait une relecture manuelle
minutieuse du TypeScript ajouté/modifié pour limiter le risque, mais cela ne
remplace pas `tsc`/`eslint`/`vite build` réels.

## 17. Configuration restante avant production
Voir la checklist complète dans `docs/PAYMENTS.md` §11. En résumé, **rien
n'est utilisable avec de vrais clients tant que** :
- [ ] `npm run typecheck && npm run lint && npm run build` n'ont pas été
      exécutés avec succès dans un environnement avec accès réseau.
- [ ] Un compte marchand CinetPay réel n'est pas créé et validé.
- [ ] Les secrets CinetPay ne sont pas configurés dans Supabase
      (`supabase secrets set`).
- [ ] `payment_settings.enabled_methods` n'a pas été activé pour Mobile
      Money/carte (désactivé par défaut).
- [ ] La commission (`commission_value`, 5 % par défaut) n'a pas été ajustée
      à la valeur métier réelle.
- [ ] Un paiement de bout en bout n'a pas été testé en sandbox/réel.
- [ ] Le processus de règlement producteur (§14) n'a pas été défini.

---

**Vision de départ tenue** : plus de `payment_status = 'demo_paid'` produit
par aucun chemin actif, plus de « paiement simulé » affiché dans l'UI de
paiement en ligne, secrets exclusivement côté serveur, confirmation
exclusivement pilotée par le webhook vérifié, montant toujours recalculé
côté serveur, idempotence par verrouillage de ligne + journal d'événements,
et statut jamais modifiable directement par le frontend. Ce qui reste ouvert
(§16 et §17) est explicitement listé plutôt que passé sous silence.
