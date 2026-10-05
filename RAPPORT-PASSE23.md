# PASSE 23 — TERMINÉE (avec réserves listées ci-dessous)

## Problème résolu
Quand un acheteur commande auprès d'un producteur absent, AgriFlow ne le laisse plus attendre indéfiniment :
1. le producteur est notifié immédiatement (in-app, avec produit, quantité, montant, acheteur et échéance) ;
2. la commande reste `pending` avec une **échéance réelle** (`confirmation_deadline`, délai configurable, 24 h par défaut) ;
3. rappel (T+8 h), dernier rappel (T+20 h), puis expiration automatique côté **serveur** (SQL + pg_cron et/ou Edge Function `order-confirmation-cron`) — aucun `setTimeout` React ;
4. l'acheteur voit « Confirmation du producteur en attente », le temps restant calculé depuis l'échéance, et la dernière activité du producteur seulement si elle existe ;
5. à l'expiration : stock remis en vente, acheteur informé, **alternatives réelles** proposées (jamais choisies à sa place) ;
6. si le paiement était déjà encaissé : `payment_status` reste `paid`, une demande de remboursement `requested` est créée → « remboursement à traiter ». « Remboursé » n'apparaît qu'après confirmation admin ;
7. chaque événement est tracé dans `order_events`.

**Changement de comportement à connaître :** le paiement en ligne ne confirme plus la commande automatiquement (c'était le cas depuis la passe 16) ; le producteur confirme, sinon elle expire.

## Base de données
Créé : `order_confirmation_settings`, `order_events`, `notification_deliveries`.
Modifié : `profiles` (+`is_available_for_orders`, `availability_until`, `last_seen_at`), `orders` (+`confirmation_deadline`, `confirmed_at`, `expired_at`, `cancel_reason`), `notifications` (+`dedupe_key`), `refunds` (index unique « un remboursement actif par paiement »).
Réutilisé : `notifications`, `refunds`, `order_status_history`, `payments`, machine à états existante.

## Migrations
`supabase/migrations/20260930090000_producer_availability_order_confirmation.sql` — idempotente (appliquée deux fois sans erreur ; `DROP POLICY/TRIGGER IF EXISTS`, `ADD COLUMN IF NOT EXISTS`, index `IF NOT EXISTS`). Redéfinit `payment_apply_result` (seule fonction existante modifiée) ; `create_order_from_cart` et `transition_order_status` sont inchangées (comportement ajouté par triggers).

## Notifications
In-app idempotent (index unique `(user_id, dedupe_key)`). Niveaux : nouvelle commande / rappel / dernier rappel / expiration (+ « payée, à confirmer », « remboursement à traiter »). Centre de notifications : 6 catégories, non lu/lu, date, bouton d'action, clic → page commande.
E-mail : code prêt (Resend), **non testé** (aucun fournisseur configuré ici). SMS / push : non implémentés, ignorés proprement.

## Edge Functions / Cron
`order-confirmation-cron` (nouvelle, protégée par `x-cron-secret`, fail-closed) — **non exécutée** (pas de Deno ici). pg_cron : planification automatique conditionnelle dans la migration (**non exécutable ici**, extension absente de mon PostgreSQL de test). La logique SQL appelée par les deux est, elle, testée.

## Parcours acheteur
Bannière d'état (pourquoi / que faire), temps restant réel, dernière activité du producteur (si donnée), mention « Producteur temporairement indisponible », timeline adaptée (paiement confirmé seulement si réel), commande expirée/refusée avec statut de remboursement honnête et liste d'alternatives (ou « Aucun producteur disponible pour cette demande actuellement. »).

## Parcours producteur
Section « Commandes nécessitant votre attention » (produit, quantité, acheteur, montant, temps restant, Confirmer/Refuser), bandeau « Vous êtes actuellement indisponible », paramètre « Disponibilité des commandes » (Profil) avec date de retour optionnelle. Fiche publique : badge Disponible / Temporairement indisponible + « Actif il y a … » (si `last_seen_at`). Marketplace : mention discrète + CTA « Voir l'offre » ; fiche produit : notice, ajout au panier désactivé.
Admin : vue « Commandes en attente de confirmation » (filtres En attente / Bientôt expirées / Expirées / Confirmées, pagination, délais éditables).

## Paiement
Voir « Problème résolu » 6. Aucun remboursement automatique chez le prestataire n'est déclenché (la fonction `payment-refund` existante reste une action admin).

## Langues
`LanguageSwitcher` corrigé : cause racine = `[&_span]:hidden` de l'en-tête qui masquait aussi les noms de langues du menu. Ajouts : fermeture clic extérieur / Échap, flèches/Home/End, retour du focus, coche + `aria-selected`, contraste clair/sombre, `z-50`, largeur bornée à l'écran, mention « partiel ».
i18n existant conservé (+ interpolation `{param}` rétro-compatible). 138 nouvelles clés FR ; **kiswahili : 69 clés (à faire relire par un locuteur natif)** ; **Lingála, Kikongo, Tshiluba : aucune nouvelle traduction** (repli français, signalé « partiel »). Couverture globale : fr 100 %, sw 58 %, ln/kg/lu 21 %. Liste à traduire : `docs/TRADUCTIONS-A-VALIDER.md`.

## RLS
`order_events` (participants + admin, lecture seule), `notification_deliveries` et `order_confirmation_settings` (admin). `last_seen_at` illisible par colonne, modifiable uniquement via RPC. Fonctions internes sans EXECUTE pour `anon`/`authenticated` ; tâche serveur réservée à `service_role`. Testé (voir ci-dessous).

## Tests
Typecheck : **PASS** · Lint : **PASS** · Build : **PASS** (avertissement habituel de taille de chunk, préexistant)
Tests SQL réels sur PostgreSQL 16 : `bash supabase/tests/run-all.sh` — **PASS** (l'ancien `10_e2e_order_lifecycle.sql`, déjà cassé avant la passe, a été réparé et adapté).
Tests unitaires TS (temps restant, présence, disponibilité, traductions, libellés de remboursement) : **PASS** (exécution ad hoc, non ajoutée au dépôt : le projet n'a pas de runner de tests).

## Tests métier
Producteur actif : PASS (SQL) · Producteur inactif : PASS (SQL) · Rappel / dernier rappel : PASS (SQL) · Expiration : PASS (SQL) · Double clic : PASS partiel (commande rejouée = déjà couvert par `create_order_from_cart`, notifications/événements dédupliqués ; double clic UI non testé en navigateur) · Double cron : PASS (SQL) · Notification dupliquée : PASS (SQL) · Paiement déjà confirmé + expiration : PASS (SQL, y compris webhook rejoué) · Alternative / aucune alternative : PASS (SQL) · Indisponible / de nouveau disponible : PASS (SQL) · Confirmation juste avant l'échéance : PASS (SQL) · Refus : PASS (SQL)
Langue : **NON VÉRIFIÉ en navigateur** (code revu, logique de traduction testée).
Le temps est simulé en déplaçant `confirmation_deadline` ; aucune attente réelle.

## Ce qui reste à faire
- **Aucun test navigateur** (aucun navigateur disponible) : rendu du `LanguageSwitcher`, responsive 360→1920 px, mode sombre, navigation clavier, lecteurs d'écran, dialogues — à vérifier.
- Planifier réellement la tâche (pg_cron ou Edge Function) et déployer `order-confirmation-cron` ; elle n'a jamais été exécutée.
- Canal e-mail jamais exercé ; SMS et push non implémentés ; aucun vrai e-mail/SMS envoyé.
- Traductions Lingála / Kikongo / Tshiluba absentes pour la passe 23 ; kiswahili à relire ; titres/corps des notifications générées par la base restent en français.
- Remboursement chez le prestataire : reste manuel (admin).
- Le panier ne pré-vérifie pas la disponibilité des producteurs : la base refuse (`PRODUCER_UNAVAILABLE`) et l'interface affiche le message au moment de commander.
- La liste « À confirmer » de la page commandes producteur contient toujours aussi les commandes en ligne impayées (comportement antérieur) ; seule la section du tableau de bord est filtrée sur les commandes réellement confirmables.
- Dans l'admin, le tableau « Commandes » récentes n'a pas le statut de remboursement : une commande annulée+payée y affiche « Remboursement à traiter » même si le remboursement est « en cours ».
