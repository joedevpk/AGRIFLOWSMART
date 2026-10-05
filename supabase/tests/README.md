# Test du parcours de commande (base de données)

Ce test rejoue le parcours de bout en bout directement sur les migrations SQL, sans Supabase :
producteur publie et modifie une offre → l'acheteur commande Mobile Money (paiement `pending`) →
le paiement est initié puis confirmé comme le ferait réellement CinetPay (simulation des appels
`payment_initiate_begin` / `payment_provider_attach` / `payment_apply_result` avec le rôle
`service_role`, y compris un rejeu du même événement webhook pour vérifier l'idempotence) →
la commande reste `pending` avec une échéance (depuis la passe 23) → le producteur confirme, puis prépare, marque prête, livre →
l'acheteur confirme la réception.
Il vérifie aussi : stock décrémenté, rejeu idempotent de la commande, un acheteur ne peut pas
publier d'offre, un tiers ne voit ni ne modifie la commande.

Ce script ne remplace pas un test sandbox CinetPay réel (aucun appel HTTP n'est fait ici) : il
vérifie uniquement que la logique base de données (statuts, idempotence, permissions) se comporte
comme les Edge Functions le supposent.

```bash
createdb agri
psql -d agri -f supabase/tests/00_supabase_stubs.sql      # rôles et schémas auth/storage simulés
for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -d agri -f "$f"; done
psql -d agri -f supabase/tests/10_e2e_order_lifecycle.sql
```

Résultat attendu : la commande passe par `pending > confirmed > preparing > ready > in_delivery > delivered > completed`,
le paiement passe par `pending > processing > paid`, le rejeu du webhook est bien marqué `duplicate`,
l'insertion d'une offre par un acheteur est refusée (RLS).

## Passe 23 — producteur inactif (scénarios 1 à 11 + présence + RLS)

`20_producer_inactivity.sql` contient de **vraies assertions** (`ASSERT`, arrêt au premier échec) : producteur actif,
inactif (rappel → dernier rappel → expiration), refus, confirmation juste avant l'échéance, cron exécuté deux fois,
notification dupliquée, paiement déjà encaissé + expiration (aucun faux remboursement), alternatives (présentes / absentes),
producteur indisponible puis de nouveau disponible, `last_seen_at` limité et infalsifiable, RLS du journal.

```bash
bash supabase/tests/run-all.sh     # rejoue toutes les migrations sur une base vierge puis 10_ et 20_
```

Limites : le temps est simulé en déplaçant `confirmation_deadline` (aucune attente réelle) ; le cron, l'e-mail et l'Edge Function
`order-confirmation-cron` ne sont pas exercés ici (voir `docs/PASSE23-CONFIRMATION.md`).
