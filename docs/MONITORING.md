# Monitoring

**Aucun outil de monitoring externe n'est configuré.** Ce qui existe est prêt à être branché ; rien n'est envoyé à un tiers aujourd'hui.

## Disponible dans le code
| Zone | Ce qui existe | Où le lire |
|---|---|---|
| Frontend | Logs structurés JSON (`src/lib/logger.ts`) : horodatage, contexte, route, id utilisateur, id de requête, **masquage automatique** des mots de passe, jetons, clés, JWT, numéros de carte/téléphone. Erreurs React (`ErrorBoundary`), `unhandledrejection` et `error` journalisées. | Console du navigateur |
| Branchement outil | `registerLogSink(fn)` : reçoit chaque événement (déjà masqué). | `src/lib/logger.ts` |
| Edge Functions | `logEvent` : une ligne JSON par événement (`app: "agriflow-edge"`, niveau, fonction, référence technique) — jamais de téléphone, token, signature ni clé. | Dashboard Supabase → Edge Functions → Logs |
| Métier | `order_events` (journal par commande), `payment_events` (webhooks/vérifications, idempotents), `notification_deliveries` (canal, statut, tentatives, raison d'échec). | SQL / Table editor |
| Cron | `cron.job_run_details` (option pg_cron) et réponse JSON de `order-confirmation-cron`. | `docs/CRON.md` |

## À configurer
1. **Erreurs frontend** — créer un projet Sentry (ou équivalent), puis dans `src/main.tsx` : `registerLogSink((e) => { if (e.level === 'error') Sentry.captureMessage(e.message, { extra: e }); })`. Ne pas envoyer de données personnelles supplémentaires.
2. **Erreurs Edge Functions** — Supabase : exporter les logs (Log Drains, offre concernée) ou surveiller Logs Explorer avec les requêtes ci-dessous.
3. **Disponibilité** — sonde HTTP externe sur l'URL du site et sur `/functions/v1/payment-webhook` (une requête GET doit répondre sans 5xx).
4. **Alertes à créer** (aucune n'existe) :
   - `payment-webhook` ou `payment-verify` : `level=error` > 0 sur 5 min ;
   - `payment-initiate` : `PROVIDER_UNAVAILABLE` répété ;
   - paiements `processing` de plus de 30 min : `select count(*) from payments where status='processing' and created_at < now() - interval '30 min'`;
   - remboursements `requested` de plus de 24 h ;
   - cron silencieux depuis plus de 30 min ;
   - `notification_deliveries.status='failed'` en hausse.

Requêtes utiles (Logs Explorer, fonctions) : `select timestamp, event_message from function_logs where event_message like '%"level":"error"%' order by timestamp desc limit 50`.
