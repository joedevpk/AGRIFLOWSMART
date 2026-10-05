#!/usr/bin/env bash
# Concurrence RÉELLE : plusieurs sessions psql parallèles (vrais verrous PostgreSQL) synchronisées sur un même instant de départ.
# Appelé par run-all.sh sur une base vierge (variable DB). Chaque assertion qui échoue arrête le script (code != 0).
set -euo pipefail
DB=${DB:?DB manquant}
Q() { psql -X -q -At -v ON_ERROR_STOP=1 -d "$DB" "$@"; }
die() { echo "ÉCHEC concurrence : $*" >&2; exit 1; }
expect() { [ "$2" = "$3" ] || die "$1 : attendu '$3', obtenu '$2'"; echo "  ok  $1"; }

Q <<'SQL'
insert into auth.users(id,email,raw_user_meta_data) values
 ('a2000000-0000-0000-0000-000000000001','prod@c.cd','{"role":"producer","full_name":"Prod C"}'),
 ('b2000000-0000-0000-0000-000000000001','ach1@c.cd','{"role":"buyer","full_name":"Acheteur 1"}'),
 ('b2000000-0000-0000-0000-000000000002','ach2@c.cd','{"role":"buyer","full_name":"Acheteur 2"}'),
 ('c2000000-0000-0000-0000-000000000001','adm@c.cd','{"role":"buyer","full_name":"Admin C"}');
update profiles set role='admin' where user_id='c2000000-0000-0000-0000-000000000001';
insert into products(id,user_id,name,category,quantity,unit,price,currency,city,status) values
 ('d2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','Maïs','cereals',10,'kg',1,'USD','Kinshasa','available'),
 ('d2000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000001','Riz','cereals',500,'kg',1,'USD','Kinshasa','available');
update payment_settings set enabled_methods='["cash_on_delivery","mobile_money"]'::jsonb, method_currencies='{"mobile_money":["USD"],"card":[],"cash_on_delivery":["USD"]}'::jsonb;
SQL

ADDR='{"recipient_name":"Acheteur Test","recipient_phone":"+243812345678","address":"Avenue Test 1","city":"Kinshasa"}'
# Départ simultané : toutes les sessions attendent le même instant (1,5 s dans le futur).
START=$(Q -c "select (clock_timestamp() + interval '1500 ms')::text")
sync() { echo "select pg_sleep(greatest(0, extract(epoch from ('$START'::timestamptz - clock_timestamp()))));"; }
as_user() { echo "select set_config('request.jwt.claim.sub','$1',false), set_config('request.jwt.claim.role','authenticated',false); set role authenticated;"; }
as_service() { echo "select set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claim.role','service_role',false);"; }

echo "== 1. Deux acheteurs, même stock (10 kg, 8 kg chacun) =="
for n in 1 2; do
  ( psql -X -q -At -d "$DB" -c "$(sync) $(as_user b2000000-0000-0000-0000-00000000000$n) select (create_order_from_cart('1000000$n-0000-0000-0000-000000000000'::uuid, '[{\"product_id\":\"d2000000-0000-0000-0000-000000000001\",\"quantity\":8}]'::jsonb, '$ADDR'::jsonb, 'cash_on_delivery', null)->>'ok');" > /tmp/conc_stock_$n.txt 2>&1 ) &
done; wait
expect "une seule des deux commandes aboutit" "$(cat /tmp/conc_stock_1.txt /tmp/conc_stock_2.txt | grep -c '^true$')" "1"
expect "le stock ne devient jamais négatif" "$(Q -c "select quantity >= 0 from products where id='d2000000-0000-0000-0000-000000000001'")" "t"
expect "stock restant = 2 kg" "$(Q -c "select quantity from products where id='d2000000-0000-0000-0000-000000000001'")" "2"

echo "== 2. Même checkout_id soumis 5 fois en parallèle (double clic / double onglet) =="
START=$(Q -c "select (clock_timestamp() + interval '1500 ms')::text")
for n in 1 2 3 4 5; do
  ( psql -X -q -At -d "$DB" -c "$(sync) $(as_user b2000000-0000-0000-0000-000000000001) select (create_order_from_cart('99999999-0000-0000-0000-000000000000'::uuid, '[{\"product_id\":\"d2000000-0000-0000-0000-000000000002\",\"quantity\":5}]'::jsonb, '$ADDR'::jsonb, 'cash_on_delivery', null)->>'ok');" > /tmp/conc_co_$n.txt 2>&1 ) &
done; wait
expect "une seule commande pour ce checkout_id" "$(Q -c "select count(*) from orders where checkout_id='99999999-0000-0000-0000-000000000000'")" "1"
expect "stock débité une seule fois (500 -> 495)" "$(Q -c "select quantity from products where id='d2000000-0000-0000-0000-000000000002'")" "495"
expect "aucune erreur technique (toutes les sessions ont répondu true)" "$(cat /tmp/conc_co_*.txt | grep -c '^true$')" "5"

echo "== 3. Initiation de paiement simultanée (bail d'initiation) =="
Q -c "select set_config('request.jwt.claim.sub','b2000000-0000-0000-0000-000000000001',false)" >/dev/null
OID=$(Q -c "select id from orders where checkout_id='99999999-0000-0000-0000-000000000000'")
# commande Mobile Money impayée dédiée
START=$(Q -c "select (clock_timestamp() + interval '1500 ms')::text")
MID=$(psql -X -q -At -d "$DB" -c "$(as_user b2000000-0000-0000-0000-000000000001) select (create_order_from_cart('77777777-0000-0000-0000-000000000000'::uuid, '[{\"product_id\":\"d2000000-0000-0000-0000-000000000002\",\"quantity\":1}]'::jsonb, '$ADDR'::jsonb, 'mobile_money', null) #>> '{orders,0,id}');" | tail -n1)
START=$(Q -c "select (clock_timestamp() + interval '1500 ms')::text")
for n in 1 2 3; do
  ( psql -X -q -At -d "$DB" -c "$(sync) $(as_user b2000000-0000-0000-0000-000000000001) select coalesce(payment_initiate_begin('$MID'::uuid,'mobile_money','idem-key-conc-000$n','+243812345678')->>'code', 'OK');" | tail -n1 > /tmp/conc_init_$n.txt 2>&1 ) &
done; wait
expect "une seule session obtient le droit d'appeler CinetPay" "$(cat /tmp/conc_init_*.txt | grep -c '^OK$')" "1"
expect "les autres reçoivent INITIATION_IN_PROGRESS" "$(cat /tmp/conc_init_*.txt | grep -c '^INITIATION_IN_PROGRESS$')" "2"
# libération du bail puis nouvelle tentative autorisée
PID=$(Q -c "select id from payments where order_id='$MID'")
Q -c "$(as_service) select payment_initiation_release('$PID'::uuid)" >/dev/null
expect "après libération du bail, une nouvelle initiation est possible" "$(psql -X -q -At -d "$DB" -c "$(as_user b2000000-0000-0000-0000-000000000001) select coalesce(payment_initiate_begin('$MID'::uuid,'mobile_money','idem-key-conc-0009','+243812345678')->>'code','OK');" | tail -n1)" "OK"
REF=$(Q -c "select internal_reference from payments where id='$PID'")
Q -c "$(as_service) select payment_provider_attach('$PID'::uuid,'TOK-C','https://pay.test/c','{}'::jsonb)" >/dev/null

echo "== 4. Deux webhooks identiques en parallèle =="
START=$(Q -c "select (clock_timestamp() + interval '1500 ms')::text")
for n in 1 2; do
  ( psql -X -q -At -d "$DB" -c "$(sync) $(as_service) select payment_apply_result('$REF','TOK-C','ACCEPTED',(select amount from payments where id='$PID'),'USD','OM','+243812345678','webhook','EVT-C','{}'::jsonb)::text;" | tail -n1 > /tmp/conc_wh_$n.txt 2>&1 ) &
done; wait
expect "un seul événement de paiement traité" "$(Q -c "select count(*) from payment_events where payment_id='$PID' and event_type='webhook' and provider_event_id='EVT-C'")" "1"
expect "une seule notification « à confirmer » pour le producteur" "$(Q -c "select count(*) from notifications where type='order_to_confirm' and link='/orders/$MID'")" "1"
expect "une seule notification « paiement confirmé » par destinataire (2)" "$(Q -c "select count(*) from notifications where type='payment_confirmed' and link='/orders/$MID'")" "2"
expect "commande payée mais PAS confirmée automatiquement" "$(Q -c "select payment_status||'/'||status from orders where id='$MID'")" "paid/pending"
expect "commission calculée une seule fois" "$(Q -c "select (platform_fee > 0 and platform_fee = round(total_amount * 5 / 100, 2))::text from orders where id='$MID'")" "true"
expect "un des deux appels est signalé comme doublon" "$(cat /tmp/conc_wh_*.txt | grep -c 'duplicate')" "1"

echo "== 5. Deux passages du cron d'expiration en parallèle =="
Q -c "update orders set confirmation_deadline = now() - interval '1 minute' where id='$MID'" >/dev/null
START=$(Q -c "select (clock_timestamp() + interval '1500 ms')::text")
for n in 1 2; do
  ( psql -X -q -At -d "$DB" -c "$(sync) $(as_service) select run_order_confirmation_maintenance()->>'expired';" | tail -n1 > /tmp/conc_cron_$n.txt 2>&1 ) &
done; wait
expect "une seule expiration au total" "$(cat /tmp/conc_cron_1.txt /tmp/conc_cron_2.txt | paste -sd+ | bc)" "1"
expect "un seul événement confirmation_expired" "$(Q -c "select count(*) from order_events where order_id='$MID' and event_type='confirmation_expired'")" "1"
expect "stock restitué une seule fois (495 -> 495 après +1)" "$(Q -c "select quantity from products where id='d2000000-0000-0000-0000-000000000002'")" "495"
expect "paiement encaissé : demande de remboursement UNIQUE" "$(Q -c "select count(*) from refunds where order_id='$MID'")" "1"

echo "== 6. Deux demandes de remboursement simultanées =="
RID=$(Q -c "select id from refunds where order_id='$MID'")
START=$(Q -c "select (clock_timestamp() + interval '1500 ms')::text")
for n in 1 2; do
  ( psql -X -q -At -d "$DB" -c "$(sync) $(as_user b2000000-0000-0000-0000-000000000001) select coalesce(request_refund('$MID'::uuid,'Test concurrence')->>'code','OK');" | tail -n1 > /tmp/conc_rf_$n.txt 2>&1 ) &
done; wait
expect "toujours un seul remboursement actif (requested/processing)" "$(Q -c "select count(*) from refunds where order_id='$MID' and status in ('requested','processing')")" "1"
expect "aucune session n'a produit d'erreur technique" "$(cat /tmp/conc_rf_*.txt | grep -ci 'error\|ERROR')" "0"

echo "== 7. Deux traitements admin du même remboursement en parallèle =="
expect "« completed » direct depuis « requested » est refusé (machine à états)" "$(psql -X -q -At -d "$DB" -c "$(as_user c2000000-0000-0000-0000-000000000001) select admin_process_refund('$RID'::uuid,'completed','X')->>'code';" | tail -n1)" "INVALID_TRANSITION"
psql -X -q -At -d "$DB" -c "$(as_user c2000000-0000-0000-0000-000000000001) select admin_process_refund('$RID'::uuid,'processing','PROVIDER-REF');" >/dev/null
START=$(Q -c "select (clock_timestamp() + interval '1500 ms')::text")
for n in 1 2; do
  ( psql -X -q -At -d "$DB" -c "$(sync) $(as_user c2000000-0000-0000-0000-000000000001) select coalesce(admin_process_refund('$RID'::uuid,'completed','PROVIDER-REF')->>'code','OK');" | tail -n1 > /tmp/conc_ap_$n.txt 2>&1 ) &
done; wait
expect "un seul des deux appels réussit, l'autre reçoit INVALID_TRANSITION" "$(cat /tmp/conc_ap_1.txt /tmp/conc_ap_2.txt | grep -c '^INVALID_TRANSITION$')" "1"
expect "un seul traitement « completed »" "$(Q -c "select count(*) from order_events where order_id='$MID' and event_type='payment_refund_confirmed'")" "1"
expect "payment_status = refunded une seule fois" "$(Q -c "select payment_status from orders where id='$MID'")" "refunded"
echo "CONCURRENCE : OK"
