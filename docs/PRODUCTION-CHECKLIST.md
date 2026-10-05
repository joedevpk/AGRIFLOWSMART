# Checklist de mise en production

Légende : `[x]` fait et vérifié dans ce dépôt · `[ ]` à faire / à vérifier par l'équipe · **NON TESTÉ** = écrit mais jamais exécuté.

## Application
- [x] Build (`npm run build`) — passe en local
- [x] Typecheck (`npm run typecheck`, `npm run typecheck:edge`)
- [x] Lint (`npm run lint`)
- [x] Tests unitaires (`npm test`) — 75+ tests
- [ ] E2E Playwright — **NON TESTÉ** (aucun navigateur lors de la passe 24) : `tests/e2e/README.md`
- [ ] Responsive 360 → 1920 px — **NON TESTÉ** (aucun navigateur)
- [ ] Accessibilité (clavier, lecteur d'écran, contraste) — **NON TESTÉ** ; points traités dans le code : `LanguageSwitcher`, switch disponibilité, aria sur les alertes
- [ ] Test de charge k6 — **NON TESTÉ** : `tests/load/README.md` (staging uniquement)

## Supabase
- [ ] Projet lié (`supabase link`) · [ ] migrations synchronisées (`supabase migration list` : Local = Remote)
- [x] Migrations rejouées depuis une base vierge + idempotentes (`bash supabase/tests/run-all.sh`)
- [ ] RLS vérifiée sur le projet distant (`select … where not rowsecurity` → 0 ligne) — assertions détaillées exécutées en local seulement
- [ ] Storage : limites 5 Mo / MIME visibles dans le dashboard · [ ] Auth : Site URL, redirections, SMTP, confirmation e-mail
- [ ] Edge Functions déployées (5) · [ ] secrets configurés (`supabase secrets set`)

## Paiement
- [ ] CinetPay : compte marchand validé, moyens et devises vérifiés, `payment_settings` renseigné par l'admin
- [ ] Webhook public joignable · [ ] **paiement réel de test** · [ ] double webhook rejoué en réel · [ ] **remboursement réel testé**
- [x] Montant / devise / commande relus côté serveur ; idempotence et bail d'initiation (testés en SQL, concurrence réelle)
- [ ] Résultats des essais réels consignés ici : ______

## Cron
- [ ] `order-confirmation-cron` déployé · [ ] `CRON_SECRET` configuré · [ ] planification active (toutes les 10 min) · [ ] rappel testé en staging · [ ] expiration testée en staging
- [x] Logique SQL des rappels / expiration (idempotente, double passage testé)

## Hosting
- [ ] Render connecté · [x] build command / `dist` / rewrite SPA / en-têtes / cache écrits dans `render.yaml` (**NON TESTÉ** sur Render)
- [ ] Variables `VITE_*` saisies · [ ] HTTPS / domaine / DNS · [ ] CSP passée de Report-Only à active après vérification navigateur (`docs/DEPLOYMENT.md`)

## Sécurité
- [x] Aucun secret dans Git (`.gitignore`, exemples vides) · [x] aucun `service_role` dans le frontend (garde au démarrage + contrôle CI du bundle)
- [x] RLS conservée, assertions rôle par rôle (`40_security_rls.sql`) · [x] Storage : dossier propriétaire + limites serveur (testés en local)
- [x] Logs masqués (tests) · [x] erreurs utilisateur propres (Error Boundary, page de configuration)
- [ ] Monitoring externe configuré — **non configuré** (`docs/MONITORING.md`) · [ ] sauvegarde planifiée et **restauration testée** — **NON TESTÉ** (`docs/BACKUP-RESTORE.md`)
