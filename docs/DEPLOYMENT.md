# Déploiement — AgriFlow RDC

Un **projet Supabase = un environnement** (développement, staging, production). Ne jamais réutiliser clés, URL ni secrets d'un environnement dans un autre.
Aucune référence de projet n'est écrite dans le dépôt : elle se définit avec `supabase link`.

## 0. Vérifier le code (local ou CI)
```bash
npm ci
npm run typecheck && npm run typecheck:edge && npm run lint && npm test
npm run db:check          # contrôles statiques des migrations (nommage, ordre, pas de destruction, policies rejouables)
bash supabase/tests/run-all.sh   # PostgreSQL local : TOUTES les migrations depuis une base vierge + tests SQL (échoue à la 1re erreur)
npm run build
```
`npm run check` enchaîne typecheck, edge, lint, tests, db:check et build.

## 1. Supabase — lier le projet et synchroniser les migrations
```bash
npm i -g supabase            # ou npx supabase ...
supabase login
supabase link --project-ref <REF_DU_PROJET>      # staging d'abord
supabase migration list                          # colonne « Local » vs « Remote » : DOIT être relue avant tout push
bash scripts/check-migrations.sh                 # ré-affiche supabase migration list quand le projet est lié
supabase db push --dry-run                       # liste ce qui serait appliqué, sans rien exécuter
supabase db push                                 # applique les migrations manquantes, dans l'ordre
```
**Si le schéma a déjà été créé à la main dans le SQL Editor** (cas des passes précédentes) : `supabase db push` verrait toutes les
migrations comme « non appliquées ». Ne rien recréer : vérifier qu'une migration est bien présente en base, puis la déclarer
appliquée sans l'exécuter : `supabase migration repair --status applied <horodatage>` (une commande par migration déjà présente),
puis relancer `supabase migration list` jusqu'à ce que Local = Remote hors nouvelles migrations. Les migrations sont écrites pour être
rejouables (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`…), mais ne rejouez pas sans raison.

Production : mêmes étapes **après** validation sur staging. Les `CREATE INDEX` de `20261001090000_production_hardening.sql` verrouillent
l'écriture le temps de la création : sur une grosse table, les exécuter une par une avec `CREATE INDEX CONCURRENTLY` (hors transaction).

## 2. Edge Functions et secrets
```bash
cp supabase/functions/.env.example supabase/functions/.env     # ignoré par Git ; remplir les valeurs
supabase secrets set --env-file supabase/functions/.env
supabase functions deploy payment-initiate
supabase functions deploy payment-verify
supabase functions deploy payment-refund
supabase functions deploy payment-webhook
supabase functions deploy order-confirmation-cron
```
La vérification JWT par fonction est réglée dans `supabase/config.toml` (désactivée seulement pour `payment-webhook` et
`order-confirmation-cron`, qui s'authentifient eux-mêmes : signature HMAC + revérification CinetPay / `x-cron-secret`).
Secrets : `CINETPAY_API_KEY`, `CINETPAY_SITE_ID`, `CINETPAY_SECRET_KEY`, `CINETPAY_BASE_URL`, `FRONTEND_URL`, `SITE_URL`, `CRON_SECRET`,
`RESEND_API_KEY`, `EMAIL_FROM`. **Jamais dans Git, jamais dans `render.yaml`, jamais dans une variable `VITE_*`.**
`FRONTEND_URL` limite aussi le CORS des fonctions à ce site : obligatoire en production.

## 3. Auth
Dashboard → Authentication → URL Configuration : *Site URL* = URL publique du frontend ; *Redirect URLs* : la même + `/login`.
Régler le SMTP de production (sinon les e-mails Supabase par défaut sont très limités) et décider de `enable_confirmations`
(recommandé en production). La page « Mot de passe oublié » appelle réellement `resetPasswordForEmail` (corrigé en passe 24) ;
**aucune page « nouveau mot de passe » dédiée n'existe** : le lien de récupération redirige vers `/login` — voir Risques du rapport.

## 4. Storage
Buckets `avatars` et `product-images` (publics en lecture, écriture limitée au dossier `<user_id>/` par RLS). La migration
`20261001090000` impose côté serveur 5 Mo et `image/jpeg|png|webp`. Vérifier dans Dashboard → Storage que les deux limites apparaissent.

## 5. Cron, tests, RLS
- Planification : voir `docs/CRON.md`.
- Tester les fonctions : `curl` de `docs/CRON.md` pour le cron ; paiement réel de test selon la section CinetPay ci-dessous.
- Vérifier la RLS sur le projet distant : `select tablename, rowsecurity from pg_tables where schemaname='public' and not rowsecurity;` doit renvoyer **0 ligne** ;
  les assertions détaillées (rôle par rôle) sont dans `supabase/tests/40_security_rls.sql`, exécutables sur la base locale.

## 6. Hébergement frontend — Render (Static Site)
1. Render → New → *Blueprint* → dépôt GitHub → `render.yaml` est lu (build `npm ci && npm run build`, publication `dist`, rewrite SPA `/*` → `/index.html`).
2. Saisir dans le dashboard (valeurs `sync: false`) : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (clé **anon** uniquement), contacts optionnels.
3. `autoDeployTrigger: checksPass` : Render ne déploie qu'une fois la CI GitHub verte.
4. Domaine personnalisé + HTTPS (automatique) → DNS chez le registrar ; mettre à jour `FRONTEND_URL` / `SITE_URL` (secrets Supabase) et la *Site URL* Auth.
5. En-têtes (voir `render.yaml`) : `nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`, `HSTS` ; cache : `/assets/*` immuable un an,
   `index.html` et `sw.js` jamais mis en cache.

### Activer la CSP (NON TESTÉE)
`render.yaml` publie `Content-Security-Policy-Report-Only` : elle n'empêche rien. Procédure : déployer sur staging, ouvrir marketplace, panier, paiement
(redirection CinetPay), profil avec avatar, producteur avec upload ; lire la console (« would violate… »). Ajuster `img-src` / `connect-src`
si une origine légitime est signalée, puis renommer l'en-tête en `Content-Security-Policy`. Ne pas activer sans cette vérification.

## 7. CinetPay — avant d'ouvrir les paiements
**Rien n'est activé automatiquement** : les moyens de paiement viennent de `payment_settings` (admin). Avant production : compte marchand validé ·
moyens et devises vérifiés · webhook joignable publiquement (`https://<ref>.supabase.co/functions/v1/payment-webhook`) · secrets configurés ·
**un paiement réel de test** · double webhook rejoué · remboursement testé selon la procédure réelle CinetPay. Consigner les résultats dans
`docs/PRODUCTION-CHECKLIST.md`. Ces essais n'ont **pas** été réalisés lors de la passe 24.
