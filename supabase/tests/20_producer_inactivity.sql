-- Passe 23 — scénarios métier « producteur inactif » au niveau base de données (PostgreSQL local).
-- Exécution : voir supabase/tests/README.md. Toute assertion échouée arrête le script (ON_ERROR_STOP).
\set ON_ERROR_STOP on
\set QUIET on

insert into auth.users(id,email,raw_user_meta_data) values
 ('a1000000-0000-0000-0000-000000000001','actif@test.cd','{"role":"producer","full_name":"Producteur Actif","city":"Kinshasa"}'),
 ('a1000000-0000-0000-0000-000000000002','inactif@test.cd','{"role":"producer","full_name":"Producteur Inactif","city":"Kinshasa"}'),
 ('a1000000-0000-0000-0000-000000000003','alt@test.cd','{"role":"producer","full_name":"Producteur Alternatif","city":"Kinshasa"}'),
 ('b1000000-0000-0000-0000-000000000001','acheteur@test.cd','{"role":"buyer","full_name":"Acheteur Un"}'),
 ('c1000000-0000-0000-0000-000000000001','admin@test.cd','{"role":"buyer","full_name":"Admin"}');
update profiles set role='admin' where user_id='c1000000-0000-0000-0000-000000000001';

insert into products(id,user_id,name,category,quantity,unit,price,currency,city,status) values
 ('d1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','Maïs','cereals',1000,'kg',0.5,'USD','Kinshasa','available'),
 ('d1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000002','Maïs','cereals',1000,'kg',0.5,'USD','Kinshasa','available'),
 ('d1000000-0000-0000-0000-000000000003','a1000000-0000-0000-0000-000000000003','Maïs','cereals',1000,'kg',0.6,'USD','Kinshasa','available');

create or replace function pg_temp.as_user(u text) returns void language plpgsql as $f$
begin perform set_config('request.jwt.claim.sub', u, false); perform set_config('request.jwt.claim.role', 'authenticated', false); end $f$;
create or replace function pg_temp.as_service() returns void language plpgsql as $f$
begin perform set_config('request.jwt.claim.sub', '', false); perform set_config('request.jwt.claim.role', 'service_role', false); end $f$;

create or replace function pg_temp.order_cod(p_buyer text, p_product text, p_qty numeric, p_checkout text, p_method text default 'cash_on_delivery') returns uuid language plpgsql as $f$
declare r jsonb;
begin
  perform pg_temp.as_user(p_buyer);
  set local role authenticated;
  r := create_order_from_cart(p_checkout::uuid, jsonb_build_array(jsonb_build_object('product_id',p_product,'quantity',p_qty)),
    '{"recipient_name":"Acheteur","recipient_phone":"+243812345678","address":"Av. Test 1","city":"Kinshasa","commune":"Gombe","instructions":""}'::jsonb,
    p_method, null);
  reset role;
  if r->>'ok' <> 'true' then raise exception 'commande refusée: %', r; end if;
  return (r #>> '{orders,0,id}')::uuid;
end $f$;

-- ---------------------------------------------------------------- SCÉNARIO 1 : producteur actif confirme
select pg_temp.order_cod('b1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001',200,'11111111-1111-1111-1111-111111111111') as o1 \gset
select set_config('t.o1', :'o1', false) as _x \gset _
do $$ declare v record; n int; begin
  select * into v from orders where id = current_setting('t.o1')::uuid;
  assert v.status='pending' and v.confirmation_deadline is not null, 'S1: échéance posée à la création (paiement à la livraison)';
  assert v.confirmation_deadline between now()+interval '23 hours 59 minutes' and now()+interval '24 hours 1 minute', 'S1: délai par défaut 24 h (configuration)';
  select count(*) into n from notifications where user_id='a1000000-0000-0000-0000-000000000001' and type='new_order' and link='/orders/'||v.id;
  assert n=1, 'S1: producteur notifié immédiatement';
  select count(*) into n from notifications where user_id='a1000000-0000-0000-0000-000000000001' and type='new_order' and body like '%Acheteur Un%' and body like '%200 kg%' and body like '%à confirmer avant le%';
  assert n=1, 'S1: la notification contient produit/quantité/acheteur/délai';
  select count(*) into n from order_events where order_id=v.id and event_type in ('order_created','producer_notified');
  assert n=2, 'S1: événements order_created + producer_notified';
end $$;
select pg_temp.as_user('a1000000-0000-0000-0000-000000000001') \gset
set role authenticated;
select (transition_order_status(:'o1'::uuid,'confirmed','ok')->>'ok') = 'true' as ok \gset
select set_config('t.ok', :'ok', false) as _x \gset _
reset role;
do $$ begin
  assert (select status from orders where id=current_setting('t.o1')::uuid)='confirmed', 'S1: la commande est confirmée';
  assert (select confirmed_at from orders where id=current_setting('t.o1')::uuid) is not null, 'S1: confirmed_at renseigné';
  assert exists (select 1 from order_events where order_id=current_setting('t.o1')::uuid and event_type='producer_confirmed'), 'S1: événement producer_confirmed';
end $$;
select pg_temp.as_service() \gset
select run_order_confirmation_maintenance() as m \gset
select set_config('t.m', :'m', false) as _x \gset _
do $$ begin assert (select status from orders where id=current_setting('t.o1')::uuid)='confirmed', 'S1: une commande confirmée n''est jamais expirée'; end $$;
select 'S1 producteur actif confirme : OK' as test;

-- ---------------------------------------------------------------- SCÉNARIO 2 : producteur inactif -> rappel -> dernier rappel -> expiration
select pg_temp.order_cod('b1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000002',200,'22222222-2222-2222-2222-222222222222') as o2 \gset
select set_config('t.o2', :'o2', false) as _x \gset _
do $$ begin assert (select quantity from products where id='d1000000-0000-0000-0000-000000000002')=800, 'S2: stock réservé'; end $$;
-- T+9 h : rappel
update orders set confirmation_deadline = now() + interval '15 hours' where id=:'o2'::uuid;
select pg_temp.as_service() \gset
select run_order_confirmation_maintenance() as m1 \gset
select set_config('t.m1', :'m1', false) as _x \gset _
do $$ declare m jsonb := current_setting('t.m1')::jsonb; begin
  assert (m->>'reminders')::int=1 and (m->>'last_reminders')::int=0, 'S2: un rappel, pas de dernier rappel : '||m;
  assert exists (select 1 from notifications where user_id='a1000000-0000-0000-0000-000000000002' and type='order_reminder'), 'S2: rappel reçu';
end $$;
-- exécuté une 2e fois : pas de doublon (scénarios 5 et 6 pour les notifications)
select run_order_confirmation_maintenance() as m1b \gset
select set_config('t.m1b', :'m1b', false) as _x \gset _
do $$ begin assert (select count(*) from notifications where user_id='a1000000-0000-0000-0000-000000000002' and type='order_reminder')=1, 'S6: rappel non dupliqué'; end $$;
-- T+22 h : dernier rappel
update orders set confirmation_deadline = now() + interval '2 hours' where id=:'o2'::uuid;
select run_order_confirmation_maintenance() as m2 \gset
select set_config('t.m2', :'m2', false) as _x \gset _
do $$ declare m jsonb := current_setting('t.m2')::jsonb; begin
  assert (m->>'last_reminders')::int=1, 'S2: dernier rappel : '||m;
  assert (select count(*) from notifications where user_id='a1000000-0000-0000-0000-000000000002' and type='order_last_reminder')=1, 'S2: dernier rappel reçu';
  assert (select count(*) from order_events where order_id=current_setting('t.o2')::uuid and event_type='producer_reminder_sent')=2, 'S2: 2 événements de rappel';
end $$;
-- Expiration
update orders set confirmation_deadline = now() - interval '1 minute' where id=:'o2'::uuid;
select run_order_confirmation_maintenance() as m3 \gset
select set_config('t.m3', :'m3', false) as _x \gset _
do $$ declare v orders%rowtype; begin
  select * into v from orders where id=current_setting('t.o2')::uuid;
  assert v.status='cancelled' and v.cancel_reason='confirmation_expired' and v.expired_at is not null, 'S2: commande expirée (statut existant cancelled)';
  assert v.payment_status='cancelled', 'S2: paiement non encaissé annulé, jamais « remboursé »';
  assert (select quantity from products where id='d1000000-0000-0000-0000-000000000002')=1000, 'S2: stock remis en vente';
  assert exists (select 1 from notifications where user_id=v.buyer_id and type='order_expired'), 'S2: acheteur informé';
  assert exists (select 1 from notifications where user_id=v.producer_id and type='order_expired'), 'S2: producteur informé (notification finale)';
  assert not exists (select 1 from refunds where order_id=v.id), 'S2: pas de remboursement (rien payé)';
end $$;
select 'S2 inactif: rappel, dernier rappel, expiration : OK' as test;

-- ---------------------------------------------------------------- SCÉNARIO 5 : cron lancé deux fois
select run_order_confirmation_maintenance() as m4 \gset
select set_config('t.m4', :'m4', false) as _x \gset _
do $$ declare m jsonb := current_setting('t.m4')::jsonb; begin
  assert (m->>'expired')::int=0 and (m->>'reminders')::int=0, 'S5: second passage sans effet : '||m;
  assert (select count(*) from order_events where order_id=current_setting('t.o2')::uuid and event_type='confirmation_expired')=1, 'S5: une seule expiration journalisée';
  assert (select count(*) from notifications where user_id='b1000000-0000-0000-0000-000000000001' and type='order_expired')=1, 'S5: une seule notification d''expiration';
  assert (select quantity from products where id='d1000000-0000-0000-0000-000000000002')=1000, 'S5: stock restitué une seule fois';
end $$;
select 'S5 double cron : OK' as test;

-- ---------------------------------------------------------------- SCÉNARIO 6 : notification envoyée deux fois
do $$ declare a uuid; b uuid; begin
  a := _notify('b1000000-0000-0000-0000-000000000001','order_reminder','t','b','/x','dup:test');
  b := _notify('b1000000-0000-0000-0000-000000000001','order_reminder','t','b','/x','dup:test');
  assert a is not null and b is null, 'S6: la 2e notification identique est ignorée';
end $$;
select 'S6 notification dupliquée : OK' as test;

-- ---------------------------------------------------------------- SCÉNARIO 3 : le producteur refuse
select pg_temp.order_cod('b1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001',50,'33333333-3333-3333-3333-333333333333') as o3 \gset
select set_config('t.o3', :'o3', false) as _x \gset _
select pg_temp.as_user('a1000000-0000-0000-0000-000000000001') \gset
set role authenticated;
select transition_order_status(:'o3'::uuid,'cancelled','Commande refusée par le producteur') ->> 'ok' as ok \gset
select set_config('t.ok', :'ok', false) as _x \gset _
reset role;
do $$ declare v orders%rowtype; begin
  select * into v from orders where id=current_setting('t.o3')::uuid;
  assert v.status='cancelled' and v.cancel_reason='producer_rejected', 'S3: refus -> cancelled / producer_rejected';
  assert exists (select 1 from notifications where user_id=v.buyer_id and type='order_cancelled' and link='/orders/'||v.id), 'S3: acheteur informé';
  assert exists (select 1 from order_events where order_id=v.id and event_type='producer_rejected'), 'S3: événement producer_rejected';
  assert (select quantity from products where id='d1000000-0000-0000-0000-000000000001')=800, 'S3: stock du refus restitué (1000-200 déjà confirmée)';
end $$;
select 'S3 refus : OK' as test;

-- ---------------------------------------------------------------- SCÉNARIO 4 : confirme juste avant la deadline
select pg_temp.order_cod('b1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001',10,'44444444-4444-4444-4444-444444444444') as o4 \gset
select set_config('t.o4', :'o4', false) as _x \gset _
update orders set confirmation_deadline = now() + interval '30 seconds' where id=:'o4'::uuid;
select pg_temp.as_user('a1000000-0000-0000-0000-000000000001') \gset
set role authenticated;
select transition_order_status(:'o4'::uuid,'confirmed','ok') ->> 'ok' as ok \gset
select set_config('t.ok', :'ok', false) as _x \gset _
reset role;
select pg_temp.as_service() \gset
update orders set confirmation_deadline = now() - interval '1 minute' where id=:'o4'::uuid;   -- l'échéance passe ensuite
select run_order_confirmation_maintenance() as m5 \gset
select set_config('t.m5', :'m5', false) as _x \gset _
do $$ begin
  assert (select status from orders where id=current_setting('t.o4')::uuid)='confirmed', 'S4: confirmée avant l''échéance -> jamais expirée';
  assert (select (metadata->>'before_deadline')::boolean from order_events where order_id=current_setting('t.o4')::uuid and event_type='producer_confirmed'), 'S4: journal before_deadline = true';
end $$;
select 'S4 confirmation juste avant la deadline : OK' as test;

-- ---------------------------------------------------------------- SCÉNARIO 7 : paiement déjà confirmé + expiration
select pg_temp.order_cod('b1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000002',100,'55555555-5555-5555-5555-555555555555','mobile_money') as o7 \gset
select set_config('t.o7', :'o7', false) as _x \gset _
do $$ begin assert (select confirmation_deadline from orders where id=current_setting('t.o7')::uuid) is null, 'S7: Mobile Money impayé : le délai ne démarre pas encore'; end $$;
-- on autorise Mobile Money pour le test (configuration admin) puis paiement réel simulé
select pg_temp.as_user('c1000000-0000-0000-0000-000000000001') \gset
set role authenticated;
select admin_update_payment_settings('percentage',5,'["cash_on_delivery","mobile_money"]'::jsonb,'{"mobile_money":["USD"],"card":[],"cash_on_delivery":["USD"]}'::jsonb,'sandbox') ->> 'ok' as ok \gset
select set_config('t.ok', :'ok', false) as _x \gset _
reset role;
select pg_temp.as_user('b1000000-0000-0000-0000-000000000001') \gset
set role authenticated;
select payment_initiate_begin(:'o7'::uuid,'mobile_money','idem-key-s7-0001','+243812345678') ->> 'internal_reference' as ref7 \gset
select set_config('t.ref7', :'ref7', false) as _x \gset _
reset role;
select pg_temp.as_service() \gset
select payment_provider_attach((select id from payments where order_id=:'o7'::uuid),'TOK-S7','https://pay.test/s7','{}'::jsonb) as a \gset
select set_config('t.a', :'a', false) as _x \gset _
select payment_apply_result(:'ref7','TOK-S7','ACCEPTED',50,'USD','OM','+243812345678','webhook','EVT-S7','{}'::jsonb) as r \gset
select set_config('t.r', :'r', false) as _x \gset _
do $$ declare v orders%rowtype; begin
  select * into v from orders where id=current_setting('t.o7')::uuid;
  assert v.payment_status='paid' and v.status='pending', 'S7: payé mais PAS confirmé automatiquement';
  assert v.confirmation_deadline is not null, 'S7: le délai démarre au paiement';
  assert exists (select 1 from notifications where user_id=v.producer_id and type='order_to_confirm'), 'S7: producteur notifié « payée, à confirmer »';
end $$;
-- rejeu du webhook : pas de 2e notification / événement
select payment_apply_result(:'ref7','TOK-S7','ACCEPTED',50,'USD','OM','+243812345678','webhook','EVT-S7','{}'::jsonb) as r2 \gset
select set_config('t.r2', :'r2', false) as _x \gset _
do $$ begin assert (select count(*) from notifications where type='order_to_confirm' and link='/orders/'||current_setting('t.o7'))=1, 'S7: webhook rejoué sans doublon'; end $$;
update orders set confirmation_deadline = now() - interval '1 minute' where id=:'o7'::uuid;
select run_order_confirmation_maintenance() as m6 \gset
select set_config('t.m6', :'m6', false) as _x \gset _
select run_order_confirmation_maintenance() as m7 \gset
select set_config('t.m7', :'m7', false) as _x \gset _
do $$ declare v orders%rowtype; n int; begin
  select * into v from orders where id=current_setting('t.o7')::uuid;
  assert v.status='cancelled' and v.cancel_reason='confirmation_expired', 'S7: expirée';
  assert v.payment_status='paid', 'S7: payment_status reste `paid` (aucun faux remboursement)';
  assert (select status from payments where order_id=v.id)='paid', 'S7: payments.status reste `paid`';
  select count(*) into n from refunds where order_id=v.id;
  assert n=1 and (select status from refunds where order_id=v.id)='requested', 'S7: UNE demande de remboursement « requested » (à traiter), double cron inclus';
  assert not exists (select 1 from refunds where order_id=v.id and status='completed'), 'S7: rien de « completed » sans confirmation';
  assert exists (select 1 from notifications where user_id=v.buyer_id and type='payment_refund_pending'), 'S7: acheteur informé « remboursement à traiter »';
  assert exists (select 1 from notifications where user_id='c1000000-0000-0000-0000-000000000001' and type='refund_requested'), 'S7: admin alerté';
end $$;
-- seul l'admin peut confirmer un remboursement ; alors seulement il devient « refunded »
select pg_temp.as_user('c1000000-0000-0000-0000-000000000001') \gset
set role authenticated;
select admin_process_refund((select id from refunds where order_id=:'o7'::uuid),'processing','REF-1') ->> 'ok' as p1 \gset
select set_config('t.p1', :'p1', false) as _x \gset _
select admin_process_refund((select id from refunds where order_id=:'o7'::uuid),'completed','REF-1') ->> 'ok' as p2 \gset
select set_config('t.p2', :'p2', false) as _x \gset _
reset role;
do $$ begin
  assert (select payment_status from orders where id=current_setting('t.o7')::uuid)='refunded', 'S7: « refunded » uniquement après confirmation admin';
  assert exists (select 1 from order_events where order_id=current_setting('t.o7')::uuid and event_type='payment_refund_confirmed'), 'S7: événement payment_refund_confirmed';
end $$;
select 'S7 paiement confirmé + expiration : OK' as test;

-- ---------------------------------------------------------------- SCÉNARIOS 8 et 9 : alternatives
select pg_temp.as_user('b1000000-0000-0000-0000-000000000001') \gset
set role authenticated;
select order_alternatives(:'o7'::uuid) as alt \gset
select set_config('t.alt', :'alt', false) as _x \gset _
reset role;
do $$ declare a jsonb := current_setting('t.alt')::jsonb; begin
  assert (a->>'eligible')::boolean, 'S8: commande éligible aux alternatives';
  assert jsonb_array_length(a->'alternatives')>=1, 'S8: des alternatives réelles existent';
  assert not exists (select 1 from jsonb_array_elements(a->'alternatives') e where e->>'producer_id'='a1000000-0000-0000-0000-000000000002'), 'S8: jamais le producteur défaillant';
  assert (select count(*) from jsonb_array_elements(a->'alternatives') e where e->>'name'='Maïs')=jsonb_array_length(a->'alternatives'), 'S8: uniquement des produits présents en base';
end $$;
-- producteurs alternatifs deviennent indisponibles / épuisés -> aucune alternative
update products set status='sold_out' where id in ('d1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000003');
select pg_temp.as_user('b1000000-0000-0000-0000-000000000001') \gset
set role authenticated;
select order_alternatives(:'o7'::uuid) as alt2 \gset
select set_config('t.alt2', :'alt2', false) as _x \gset _
reset role;
do $$ begin assert jsonb_array_length((current_setting('t.alt2')::jsonb)->'alternatives')=0, 'S9: aucune alternative -> liste vide (message côté interface)'; end $$;
update products set status='available' where id in ('d1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000003');
-- un tiers ne peut pas lire les alternatives d'une commande qui n'est pas la sienne
select pg_temp.as_user('a1000000-0000-0000-0000-000000000003') \gset
set role authenticated;
select order_alternatives(:'o7'::uuid) ->> 'code' as refus \gset
select set_config('t.refus', :'refus', false) as _x \gset _
reset role;
do $$ begin assert current_setting('t.refus')='ORDER_NOT_FOUND', 'S8: accès refusé à un tiers'; end $$;
select 'S8/S9 alternatives : OK' as test;

-- ---------------------------------------------------------------- SCÉNARIOS 10 et 11 : disponibilité
select pg_temp.as_user('a1000000-0000-0000-0000-000000000002') \gset
set role authenticated;
select set_my_availability(false, null) ->> 'ok' as ok \gset
select set_config('t.ok', :'ok', false) as _x \gset _
reset role;
do $$ declare r jsonb; begin
  perform pg_temp.as_user('b1000000-0000-0000-0000-000000000001');
  set local role authenticated;
  begin
    perform create_order_from_cart('66666666-6666-6666-6666-666666666666'::uuid,
      jsonb_build_array(jsonb_build_object('product_id','d1000000-0000-0000-0000-000000000002','quantity',5)),
      '{"recipient_name":"Acheteur","recipient_phone":"+243812345678","address":"Av. Test 1","city":"Kinshasa"}'::jsonb,'cash_on_delivery',null);
    reset role; assert false, 'S10: la commande aurait dû être refusée';
  exception when raise_exception then
    reset role; assert sqlerrm like '%PRODUCER_UNAVAILABLE%', 'S10: refus PRODUCER_UNAVAILABLE : '||sqlerrm;
  end;
end $$;
do $$ begin assert (select quantity from products where id='d1000000-0000-0000-0000-000000000002')=1000, 'S10: aucun stock consommé par la tentative refusée'; end $$;
-- les commandes déjà existantes ne sont pas bloquées
select pg_temp.as_user('a1000000-0000-0000-0000-000000000001') \gset
set role authenticated;
select set_my_availability(false, null) ->> 'ok' as ok \gset
select set_config('t.ok', :'ok', false) as _x \gset _
reset role;
select pg_temp.as_user('a1000000-0000-0000-0000-000000000001') \gset
select pg_temp.order_cod('b1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000003',1,'77777777-7777-7777-7777-777777777777') as o10b \gset
select set_config('t.o10b', :'o10b', false) as _x \gset _
do $$ begin assert (select status from orders where id=current_setting('t.o4')::uuid)='confirmed', 'S10: commandes existantes non affectées'; end $$;
select 'S10 producteur indisponible : OK' as test;

-- « Indisponible jusqu'au » : réactivation automatique
select pg_temp.as_user('a1000000-0000-0000-0000-000000000002') \gset
set role authenticated;
select set_my_availability(false, now() + interval '2 days') ->> 'ok' as ok \gset
select set_config('t.ok', :'ok', false) as _x \gset _
select set_my_availability(false, now() - interval '1 day') ->> 'code' as invalid_date \gset
select set_config('t.invalid_date', :'invalid_date', false) as _x \gset _
reset role;
do $$ begin assert current_setting('t.invalid_date')='INVALID_DATE', 'S10: date passée refusée'; end $$;
update profiles set availability_until = now() - interval '1 second' where user_id='a1000000-0000-0000-0000-000000000002';
do $$ begin assert producer_accepting('a1000000-0000-0000-0000-000000000002'), 'S11: échéance « indisponible jusqu''au » dépassée -> disponible à nouveau'; end $$;
select pg_temp.as_user('a1000000-0000-0000-0000-000000000002') \gset
set role authenticated;
select set_my_availability(true, null) ->> 'ok' as ok \gset
select set_config('t.ok', :'ok', false) as _x \gset _
reset role;
select pg_temp.order_cod('b1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000002',5,'88888888-8888-8888-8888-888888888888') as o11 \gset
select set_config('t.o11', :'o11', false) as _x \gset _
do $$ begin assert (select status from orders where id=current_setting('t.o11')::uuid)='pending', 'S11: producteur de nouveau disponible : commande acceptée'; end $$;
select 'S11 producteur disponible à nouveau : OK' as test;

-- ---------------------------------------------------------------- PRÉSENCE (last_seen_at)
select pg_temp.as_user('a1000000-0000-0000-0000-000000000002') \gset
set role authenticated;
select touch_last_seen() ->> 'updated' as u1 \gset
select set_config('t.u1', :'u1', false) as _x \gset _
select touch_last_seen() ->> 'updated' as u2 \gset
select set_config('t.u2', :'u2', false) as _x \gset _
reset role;
do $$ declare ua timestamptz; begin
  assert current_setting('t.u1')='true' and current_setting('t.u2')='false', 'présence: 2e appel immédiat ignoré par le serveur (écriture limitée)';
end $$;
do $$ begin
  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000002');
  set local role authenticated;
  begin
    update profiles set last_seen_at = now() + interval '1 day' where user_id='a1000000-0000-0000-0000-000000000002';
    reset role; assert false, 'présence: falsification directe aurait dû échouer';
  exception when raise_exception then reset role; assert sqlerrm like '%dernière activité%', 'présence: falsification refusée';
  end;
  -- last_seen_at illisible par colonne ; lisible via la fonction, uniquement pour les producteurs
  set local role anon;
  begin perform last_seen_at from profiles limit 1; reset role; assert false, 'last_seen_at ne doit pas être lisible directement';
  exception when insufficient_privilege then reset role; end;
end $$;
do $$ declare n int; begin
  perform pg_temp.as_user('');
  select count(*) into n from get_producer_presence(array['a1000000-0000-0000-0000-000000000002'::uuid,'b1000000-0000-0000-0000-000000000001'::uuid]);
  assert n=1, 'présence: aucune donnée d''activité pour un acheteur';
end $$;
-- updated_at ne bouge pas quand seul last_seen_at change
do $$ declare ua1 timestamptz; ua2 timestamptz; begin
  select updated_at into ua1 from profiles where user_id='a1000000-0000-0000-0000-000000000001';
  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000001');
  set local role authenticated; perform touch_last_seen(); reset role;
  select updated_at into ua2 from profiles where user_id='a1000000-0000-0000-0000-000000000001';
  assert ua1=ua2, 'présence: updated_at inchangé par une simple présence';
end $$;
select 'PRÉSENCE : OK' as test;

-- ---------------------------------------------------------------- RLS : un tiers ne voit pas le journal ; escalade impossible
do $$ begin
  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000003');
  set local role authenticated;
  assert (select count(*) from order_events where order_id=current_setting('t.o7')::uuid)=0, 'RLS: un tiers ne lit pas le journal d''une commande';
  assert (select count(*) from notification_deliveries)=0, 'RLS: deliveries réservées à l''admin';
  begin
    perform run_order_confirmation_maintenance();
    reset role; assert false, 'RLS: la tâche serveur doit être interdite aux utilisateurs';
  exception when insufficient_privilege then reset role; end;
end $$;
do $$ begin
  perform pg_temp.as_user('b1000000-0000-0000-0000-000000000001');
  set local role authenticated;
  begin update orders set confirmation_deadline = now() + interval '30 days' where id=current_setting('t.o11')::uuid; exception when others then null; end;
  reset role;
  assert (select confirmation_deadline from orders where id=current_setting('t.o11')::uuid) < now() + interval '2 days', 'RLS: l''acheteur ne peut pas repousser l''échéance';
end $$;
select 'RLS : OK' as test;

-- ---------------------------------------------------------------- Journal complet d'une commande expirée
select o.order_number, string_agg(e.event_type, ' > ' order by e.created_at, e.id) as journal
from orders o join order_events e on e.order_id=o.id where o.id=:'o7'::uuid group by o.order_number;
select 'TOUS LES SCÉNARIOS SQL : OK' as resultat;
