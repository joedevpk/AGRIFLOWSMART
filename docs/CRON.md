# Cron de confirmation des commandes

**État : le cron n'est PAS planifié par ce dépôt tant que vous n'avez pas fait l'une des deux options ci-dessous.** Une commande non
confirmée n'expirera pas sans elle (le code d'expiration est testé en SQL, pas la planification).

Ce que fait chaque passage (idempotent, rejouable, deux passages simultanés sans double effet — testé) :
rappel producteur, dernier rappel, expiration + stock restitué + notifications acheteur/producteur + demande de remboursement si payé.
L'Edge Function ajoute : envoi e-mail (si Resend configuré, 3 essais maximum) et **réconciliation** des paiements restés `processing`
(webhook CinetPay perdu : revérification auprès de CinetPay, 20 paiements maximum par passage).

**Fréquence recommandée : toutes les 10 minutes.** Délais par défaut : 24 h de confirmation, 1er rappel à 8 h, dernier rappel 4 h avant l'échéance
(modifiables : Administration → « Délais de confirmation »).

## Option A (recommandée) — Edge Function planifiée
1. Secret : `supabase secrets set CRON_SECRET=$(openssl rand -hex 32)` (noter la valeur : elle sert à l'appel planifié).
2. `supabase functions deploy order-confirmation-cron`
3. Planifier un appel HTTP POST toutes les 10 min (`*/10 * * * *`) vers
   `https://<REF>.supabase.co/functions/v1/order-confirmation-cron` avec l'en-tête `x-cron-secret: <CRON_SECRET>` :
   Dashboard Supabase → Integrations → Cron (job de type « HTTP Request »), ou `pg_cron` + `pg_net` (exemple en tête de `supabase/functions/order-confirmation-cron/index.ts`).
   Ne jamais écrire la valeur du secret dans Git.

## Option B — pg_cron seul (SQL uniquement, sans e-mail ni réconciliation)
La migration `20260930090000` planifie `agriflow-order-confirmation` (`*/10 * * * *`, `SELECT public._order_confirmation_maintenance()`)
**uniquement si l'extension `pg_cron` est disponible**. Vérifier : `select jobname, schedule, active from cron.job;` — si aucune ligne,
activer l'extension (Dashboard → Database → Extensions → pg_cron) et rejouer le dernier bloc de la migration.
Les deux options peuvent coexister (idempotent).

## Tester
```bash
# 1. Sans secret → doit répondre 403 (fail closed)
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://<REF>.supabase.co/functions/v1/order-confirmation-cron
# 2. Avec le secret → 200 et un JSON {"ok":true,"maintenance":{...},"reconciliation":{...},"channels":{...}}
curl -s -X POST -H "x-cron-secret: $CRON_SECRET" https://<REF>.supabase.co/functions/v1/order-confirmation-cron
```
Test de bout en bout (STAGING uniquement) : créer une commande paiement à la livraison, puis avancer l'échéance :
`update orders set confirmation_deadline = now() - interval '1 minute' where id = '<id>';` → relancer le curl n°2 → la commande passe `cancelled / confirmation_expired`.

## Vérifier que ça tourne vraiment
```sql
select jobname, status, start_time from cron.job_run_details order by start_time desc limit 10;   -- option B
select event_type, count(*), max(created_at) from order_events
 where event_type in ('producer_reminder_sent','confirmation_expired') group by 1;                  -- effets métier
select status, count(*) from notification_deliveries where channel = 'email' group by 1;            -- e-mails (option A)
```
Alerte à prévoir : aucune ligne `cron.job_run_details` / aucun appel de la fonction depuis > 30 min (voir `docs/MONITORING.md`).
