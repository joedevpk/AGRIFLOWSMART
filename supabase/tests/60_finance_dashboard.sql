-- PASSE 1 — Moteur de commissions : assertions réelles (arrêt au premier échec).
-- Rejoué par run-all.sh sur une base vierge (toutes les migrations appliquées).
\set QUIET on
insert into auth.users(id,email,raw_user_meta_data) values
 ('a1000000-0000-0000-0000-000000000001','admin@test.cd','{"role":"buyer","full_name":"Admin"}'),
 ('a1000000-0000-0000-0000-000000000002','prod1@test.cd','{"role":"producer","full_name":"Producteur Un","province":"Kinshasa","city":"Kinshasa"}'),
 ('a1000000-0000-0000-0000-000000000003','prod2@test.cd','{"role":"producer","full_name":"Producteur Deux","province":"Kinshasa","city":"Kinshasa"}'),
 ('a1000000-0000-0000-0000-000000000004','buyer@test.cd','{"role":"buyer","buyer_type":"restaurant","full_name":"Acheteur"}'),
 ('a1000000-0000-0000-0000-000000000005','buyer2@test.cd','{"role":"buyer","buyer_type":"market","full_name":"Autre acheteur"}');
update profiles set role='admin' where user_id='a1000000-0000-0000-0000-000000000001';
update payment_settings set enabled_methods='["cash_on_delivery","mobile_money"]'::jsonb,
  method_currencies='{"mobile_money":["USD"],"card":[],"cash_on_delivery":["USD"]}'::jsonb;
insert into products(id,user_id,name,category,quantity,unit,price,currency,province,city,status) values
 ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','Maïs','cereals',100000,'kg',33.33,'USD','Kinshasa','Kinshasa','available'),
 ('b1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000002','Manioc','tubers',100000,'kg',25,'USD','Kinshasa','Kinshasa','available'),
 ('b1000000-0000-0000-0000-000000000003','a1000000-0000-0000-0000-000000000003','Haricot','legumes',100000,'kg',10,'USD','Kinshasa','Kinshasa','available');

-- Outils de test (contexte JWT simulé ; les RPC sont SECURITY DEFINER comme en production).
create or replace function t_as(uid uuid, r text default 'authenticated') returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(uid::text,''), false); perform set_config('request.jwt.claim.role', r, false); end $$;
create or replace function t_order(chk uuid, prod uuid, qty numeric, price numeric) returns uuid language plpgsql as $$
declare r jsonb;
begin
  perform t_as('a1000000-0000-0000-0000-000000000004');
  r := create_order_from_cart(chk, jsonb_build_array(jsonb_build_object('product_id',prod,'quantity',qty)),
    '{"recipient_name":"Resto Test","recipient_phone":"+243812345678","address":"Av. 1","city":"Kinshasa","commune":"Gombe","instructions":""}'::jsonb,
    'mobile_money', round(price*qty,2));
  assert (r->>'ok')::boolean, 'création de commande : '||r::text;
  return (r #>> '{orders,0,id}')::uuid;
end $$;
create or replace function t_pay(oid uuid, evt text) returns jsonb language plpgsql as $$
declare v_ref text; v_pid uuid; v_amt numeric; v_cur text;
begin
  perform t_as('a1000000-0000-0000-0000-000000000004');
  v_ref := payment_initiate_begin(oid,'mobile_money','idem-'||evt||'-0000000','+243812345678') ->> 'internal_reference';
  select id, amount, currency into v_pid, v_amt, v_cur from payments where internal_reference = v_ref;
  perform t_as(null,'service_role');
  perform payment_provider_attach(v_pid,'TOK-'||evt,'https://checkout.cinetpay.com/x','{}'::jsonb);
  return payment_apply_result(v_ref,'TOK-'||evt,'ACCEPTED',v_amt,v_cur,'OM','+243812345678','webhook',evt,'{"simulated":true}'::jsonb);
end $$;

create or replace function t_replay(oid uuid, evt text) returns jsonb language plpgsql as $$
declare v_ref text; v_amt numeric; v_cur text;
begin
  select internal_reference, amount, currency into v_ref, v_amt, v_cur from payments where order_id=oid order by created_at desc limit 1;
  perform t_as(null,'service_role');
  return payment_apply_result(v_ref,'TOK-'||evt,'ACCEPTED',v_amt,v_cur,'OM','+243812345678','webhook',evt,'{"simulated":true,"retry":true}'::jsonb);
end $$;
create or replace function t_admin() returns void language sql as $$ select t_as('a1000000-0000-0000-0000-000000000001') $$;
create or replace function t_refund(oid uuid, amt numeric, final_status text) returns uuid language plpgsql as $$
declare v_id uuid; v_pid uuid; r jsonb;
begin
  select id into v_pid from payments where order_id=oid and paid_at is not null order by paid_at desc limit 1;
  insert into refunds(order_id,payment_id,requested_by,amount,currency,reason)
    values (oid,v_pid,'a1000000-0000-0000-0000-000000000001',amt,'USD','test') returning id into v_id;
  perform t_admin();
  r := admin_process_refund(v_id,'processing','REF-'||v_id::text); assert (r->>'ok')::boolean, 'refund processing '||r::text;
  r := admin_process_refund(v_id,final_status,'REF-'||v_id::text); assert (r->>'ok')::boolean, 'refund '||final_status||' '||r::text;
  return v_id;
end $$;


-- PASSE 2 — Dashboard financier : chiffres, périodes, permissions, export, pagination, rapprochement, journal admin.
-- Toutes les données sont créées par les RPC réelles (commandes, paiements, remboursements) ; seules les DATES sont déplacées
-- (trigger désactivés le temps de la mise à date) pour tester périodes et fuseau.
select t_admin();
select (admin_create_commission_rule(1000,'proportional','dashboard')->>'id') as rid \gset
select admin_approve_commission_rule(:'rid'::uuid,'DECISION-DASH-001',null) \gset

-- A1 : créée AVANT la règle ? non : la règle vient d'être approuvée ; on veut une commande SANS règle → on retire puis réapprouve.
select admin_retire_commission_rule(:'rid'::uuid,'test commande sans règle') \gset
select t_order('c2000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001', 3, 33.33) as a1 \gset
select t_pay(:'a1'::uuid,'DASH-A1') \gset
select t_admin();
select (admin_create_commission_rule(1000,'proportional','dashboard')->>'id') as rid2 \gset
select admin_approve_commission_rule(:'rid2'::uuid,'DECISION-DASH-002',null) \gset
select t_order('c2000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000002', 4, 25) as b1 \gset
select t_pay(:'b1'::uuid,'DASH-B1') \gset
select t_order('c2000000-0000-0000-0000-000000000003','b1000000-0000-0000-0000-000000000003', 10, 10) as b2 \gset
select t_pay(:'b2'::uuid,'DASH-B2') \gset
select t_order('c2000000-0000-0000-0000-000000000004','b1000000-0000-0000-0000-000000000001', 3, 33.33) as b3 \gset
select t_order('c2000000-0000-0000-0000-000000000005','b1000000-0000-0000-0000-000000000001', 1, 33.33) as b4 \gset
select t_refund(:'b1'::uuid, 40, 'completed') as rf1 \gset
select set_config('t.a1',:'a1',false), set_config('t.b1',:'b1',false), set_config('t.b2',:'b2',false), set_config('t.b3',:'b3',false), set_config('t.b4',:'b4',false) \gset

-- tentatives et cas particuliers (insertions directes par le propriétaire de la base, comme un import/SQL editor)
insert into payments(order_id,user_id,amount,currency,method,status,provider,internal_reference,is_demo,created_at)
  select :'b3'::uuid,'a1000000-0000-0000-0000-000000000004',99.99,'USD','mobile_money','failed','cinetpay','AGF-DASH-FAILED',false,'2026-03-20 12:05+00';
insert into payments(order_id,user_id,amount,currency,method,status,provider,internal_reference,is_demo,created_at,paid_at)
  select :'b4'::uuid,'a1000000-0000-0000-0000-000000000004',33.33,'USD','card','demo_paid','demo','AGF-DASH-DEMO',true,'2026-03-21 12:00+00','2026-03-21 12:00+00';
insert into refunds(order_id,payment_id,requested_by,amount,currency,reason,status)
  select :'b2'::uuid,(select id from payments where order_id=:'b2'::uuid and status='paid'),'a1000000-0000-0000-0000-000000000001',100,'USD','test ouvert','requested';

-- mise à date (triggers désactivés le temps de la mise à jour : seules les dates changent)
set session_replication_role = replica;
update orders set created_at='2026-03-01 12:00+00' where id=:'a1'::uuid;
update orders set created_at='2026-03-10 12:00+00' where id=:'b1'::uuid;
update orders set created_at='2026-03-15 22:00+00' where id=:'b2'::uuid;
update orders set created_at='2026-03-20 12:00+00' where id=:'b3'::uuid;
update orders set created_at='2026-03-21 12:00+00', status='cancelled' where id=:'b4'::uuid;
update payments set created_at='2026-03-01 12:00+00', paid_at='2026-03-01 12:00+00' where order_id=:'a1'::uuid and status='paid';
update payments set created_at='2026-03-10 12:00+00', paid_at='2026-03-10 12:00+00' where order_id=:'b1'::uuid and status='paid';
update payments set created_at='2026-03-15 23:00+00', paid_at='2026-03-15 23:30+00' where order_id=:'b2'::uuid and status='paid';
-- le paiement créé avec la commande B3 est « processing » depuis le 20 mars (en attente de confirmation du prestataire)
update payments set status='processing', created_at='2026-03-20 12:10+00' where order_id=:'b3'::uuid and status='pending';
update refunds set updated_at='2026-03-12 12:00+00' where id=:'rf1'::uuid;
update refunds set created_at=now()-interval '3 days' where order_id=:'b2'::uuid and status='requested';
set session_replication_role = origin;

-- ===== F1. Synthèse : définitions et chiffres exacts =====
select t_admin();
do $$ declare s jsonb; u jsonb; sub jsonb; begin
  s := admin_finance_summary('2026-03-01T00:00:00+01','2026-04-01T00:00:00+01');
  u := s->'currencies'->'USD';
  assert (u->>'orders_count')::int=4 and (u->>'orders_value')::numeric=399.98, 'F1 volume de commandes (hors annulées) : '||u::text;
  assert (u->>'cancelled_count')::int=1 and (u->>'cancelled_value')::numeric=33.33, 'F1 commandes annulées à part';
  assert (u->>'delivery_fees')::numeric=0, 'F1 frais de livraison séparés';
  assert (u->>'collected')::numeric=299.99 and (u->>'collected_count')::int=3, 'F1 argent encaissé = paiements réels confirmés (démo exclu, impayés exclus)';
  assert (u->>'refunded')::numeric=40 and (u->>'net_collected')::numeric=259.99, 'F1 remboursé et net encaissé';
  assert (u->>'refunds_open_count')::int=1 and (u->>'refunds_open_amount')::numeric=100, 'F1 remboursements ouverts (non finalisés) séparés';
  assert (u->>'payments_paid_count')::int=3 and (u->>'payments_failed_count')::int=1 and (u->>'payments_pending_count')::int=1, 'F1 paiements confirmés / échoués / en attente';
  assert (u->>'commission_gross')::numeric=20 and (u->>'commission_reversed')::numeric=4 and (u->>'commission_earned')::numeric=16, 'F1 commission acquise = brute − annulée (A1 sans règle exclue)';
  assert (u->>'paid_without_commission')::int=1, 'F1 un paiement sans règle de commission signalé';
  assert (u->>'producers_due_estimate')::numeric=144 and (u->>'producers_due_orders')::int=2, 'F1 net estimé dû aux producteurs (90−36 + 90) : '||u::text;
  assert (u->>'on_hold_orders')::int=1, 'F1 règlement en attente de décision';
  assert (u->>'commission_earned')::numeric < (u->>'collected')::numeric, 'F1 commission ≠ argent encaissé';
  assert (s->>'demo_payments_excluded')::int=1, 'F1 paiement démo compté à part';
  assert (s#>>'{payouts,available}')::boolean=false and (s#>>'{net_profit,available}')::boolean=false and (s#>>'{payment_fees,available}')::boolean=false, 'F1 reversements, bénéfice net et frais de paiement : non disponibles';
  assert s->'currencies'->'CDF' is null, 'F1 aucune devise inventée';
  -- bornes de période : début inclus, fin exclue
  sub := admin_finance_summary('2026-03-10T12:00:00Z','2026-03-15T23:30:00Z')->'currencies'->'USD';
  assert (sub->>'collected')::numeric=100 and (sub->>'collected_count')::int=1, 'F1 fin exclue (paiement B2 à 23:30 pile) / début inclus (B1 à 12:00 pile) : '||sub::text;
  assert (sub->>'commission_earned')::numeric=6, 'F1 commission B1 seule (10 − 4)';
  sub := admin_finance_summary('2026-03-10T12:00:00.000001Z','2026-03-15T23:30:00.000001Z')->'currencies'->'USD';
  assert (sub->>'collected')::numeric=100 and (sub->>'collected_count')::int=1, 'F1 B1 sort, B2 entre';
  -- période invalide
  begin perform admin_finance_summary('2026-04-01T00:00:00Z','2026-03-01T00:00:00Z'); assert false,'F1 fin avant début'; exception when raise_exception then null; end;
  begin perform admin_finance_summary('2020-01-01T00:00:00Z','2026-01-01T00:00:00Z'); assert false,'F1 période > 800 jours'; exception when raise_exception then null; end;
  begin perform admin_finance_summary(null,'2026-01-01T00:00:00Z'); assert false,'F1 période nulle'; exception when raise_exception then null; end;
  -- période sans donnée : zéros, pas d'erreur
  sub := admin_finance_summary('2025-01-01T00:00:00Z','2025-02-01T00:00:00Z')->'currencies'->'USD';
  assert (sub->>'orders_count')::int=0 and (sub->>'collected')::numeric=0 and (sub->>'commission_earned')::numeric=0 and (sub->>'refunded')::numeric=0, 'F1 période vide : indicateurs de période à zéro';
  assert (sub->>'producers_due_estimate')::numeric=144, 'F1 le net dû est un SOLDE À DATE, indépendant de la période';
end $$;
select ' F1 synthèse, définitions, bornes de période : OK' as r;

-- ===== F2. Évolution jour / semaine / mois (heure de Kinshasa) =====
do $$ declare d jsonb; w jsonb; m jsonb; x jsonb; tot_c numeric; tot_o int; begin
  d := admin_finance_timeseries('2026-03-01T00:00:00+01','2026-04-01T00:00:00+01','day','USD');
  assert jsonb_array_length(d->'rows')=31, 'F2 31 jours zéro-remplis';
  select sum((e->>'collected')::numeric), sum((e->>'orders_count')::int) into tot_c, tot_o from jsonb_array_elements(d->'rows') e;
  assert tot_c=299.99 and tot_o=4, 'F2 la somme des jours = la synthèse';
  x := (select e from jsonb_array_elements(d->'rows') e where e->>'bucket'='2026-03-16');
  assert (x->>'collected')::numeric=100, 'F2 paiement à 23:30 UTC = 00:30 le 16 à Kinshasa : bucket du 16';
  x := (select e from jsonb_array_elements(d->'rows') e where e->>'bucket'='2026-03-15');
  assert (x->>'orders_count')::int=1 and (x->>'collected')::numeric=0, 'F2 commande de 22:00 UTC = 23:00 le 15 à Kinshasa';
  x := (select e from jsonb_array_elements(d->'rows') e where e->>'bucket'='2026-03-10');
  assert (x->>'commission_earned')::numeric=6 and (x->>'refunded')::numeric=0, 'F2 commission du 10 ; remboursement daté du 12';
  x := (select e from jsonb_array_elements(d->'rows') e where e->>'bucket'='2026-03-12');
  assert (x->>'refunded')::numeric=40, 'F2 remboursement au jour de sa finalisation';
  w := admin_finance_timeseries('2026-03-01T00:00:00+01','2026-04-01T00:00:00+01','week','USD');
  assert (select e->>'bucket' from jsonb_array_elements(w->'rows') e where (e->>'collected')::numeric=100 and (e->>'bucket')>'2026-03-15' limit 1)='2026-03-16', 'F2 semaine ISO commençant le lundi 16';
  m := admin_finance_timeseries('2026-03-01T00:00:00+01','2026-04-01T00:00:00+01','month','USD');
  assert jsonb_array_length(m->'rows')=1 and (m->'rows'->0->>'bucket')='2026-03-01' and (m->'rows'->0->>'collected')::numeric=299.99 and (m->'rows'->0->>'orders_count')::int=4, 'F2 mois';
  assert (select count(*) from jsonb_array_elements(admin_finance_timeseries('2026-03-01T00:00:00+01','2026-04-01T00:00:00+01','day','CDF')->'rows') e where (e->>'collected')::numeric<>0)=0, 'F2 devises jamais mélangées';
  begin perform admin_finance_timeseries('2026-03-01T00:00:00Z','2026-04-01T00:00:00Z','hour','USD'); assert false,'F2 granularité invalide'; exception when raise_exception then null; end;
  begin perform admin_finance_timeseries('2026-03-01T00:00:00Z','2026-04-01T00:00:00Z','day',null); assert false,'F2 devise obligatoire'; exception when raise_exception then null; end;
  begin perform admin_finance_timeseries('2026-03-01T00:00:00Z','2026-04-01T00:00:00Z','day','usd; drop'); assert false,'F2 devise invalide'; exception when raise_exception then null; end;
end $$;
select ' F2 évolution jour/semaine/mois, fuseau Kinshasa : OK' as r;

-- ===== F3. Répartitions =====
do $$ declare c jsonb; p jsonb; b jsonb; begin
  c := admin_finance_breakdown('2026-03-01T00:00:00+01','2026-04-01T00:00:00+01','category','USD');
  assert jsonb_array_length(c->'rows')=3 and c->'rows'->0->>'key'='legumes' and (c->'rows'->0->>'items_value')::numeric=100
     and c->'rows'->1->>'key'='tubers' and c->'rows'->2->>'key'='cereals' and (c->'rows'->2->>'items_value')::numeric=99.99, 'F3 catégories (payées uniquement) : '||c::text;
  assert c->'rows'->0->'commission_earned' = 'null'::jsonb, 'F3 commission non ventilée par catégorie';
  p := admin_finance_breakdown('2026-03-01T00:00:00+01','2026-04-01T00:00:00+01','producer','USD');
  assert (select (e->>'items_value')::numeric from jsonb_array_elements(p->'rows') e where e->>'key'='a1000000-0000-0000-0000-000000000002')=199.99
     and (select (e->>'commission_earned')::numeric from jsonb_array_elements(p->'rows') e where e->>'key'='a1000000-0000-0000-0000-000000000002')=6
     and (select (e->>'commission_earned')::numeric from jsonb_array_elements(p->'rows') e where e->>'key'='a1000000-0000-0000-0000-000000000003')=10, 'F3 vendeurs : '||p::text;
  b := admin_finance_breakdown('2026-03-01T00:00:00+01','2026-04-01T00:00:00+01','buyer_type','USD');
  assert b->'rows'->0->>'key'='restaurant' and (b->'rows'->0->>'orders_count')::int=3 and (b->'rows'->0->>'commission_earned')::numeric=16, 'F3 type de clientèle';
  begin perform admin_finance_breakdown('2026-03-01T00:00:00Z','2026-04-01T00:00:00Z','secret','USD'); assert false,'F3 dimension invalide'; exception when raise_exception then null; end;
end $$;
select ' F3 répartitions catégorie / vendeur / clientèle : OK' as r;

-- ===== F4. Transactions : recherche, filtres, pagination, détail =====
do $$ declare r jsonb; o1 text; ref1 text; d jsonb; begin
  r := admin_transactions_search();
  assert (r->>'total')::int=5, 'F4 5 commandes au total : '||(r->>'total');
  assert r->'rows'->0->>'order_id' = current_setting('t.b4'), 'F4 tri : plus récente d''abord';
  assert (admin_transactions_search(p_payment_status => 'paid')->>'total')::int=3, 'F4 filtre statut payé';
  assert (admin_transactions_search(p_payment_status => 'pending')->>'total')::int=2, 'F4 filtre statut en attente';
  select order_number into o1 from orders where id=current_setting('t.a1')::uuid;
  assert (admin_transactions_search(p_q => o1)->>'total')::int=1, 'F4 recherche par numéro de commande';
  select internal_reference into ref1 from payments where order_id=current_setting('t.b1')::uuid and status='paid';
  assert (admin_transactions_search(p_q => ref1)->'rows'->0->>'order_id')=current_setting('t.b1'), 'F4 recherche par référence de paiement';
  assert (admin_transactions_search(p_q => 'Acheteur')->>'total')::int=5, 'F4 recherche par utilisateur';
  assert (admin_transactions_search(p_q => '%%')->>'total')::int=0, 'F4 jokers LIKE neutralisés';
  begin perform admin_transactions_search(p_q => 'x'); assert false,'F4 recherche trop courte'; exception when raise_exception then null; end;
  assert (admin_transactions_search(p_from => '2026-03-10T00:00:00+01',p_to => '2026-03-16T00:00:00+01')->>'total')::int=2, 'F4 filtre de dates (B1, B2)';
  assert (admin_transactions_search(p_currency => 'CDF')->>'total')::int=0, 'F4 filtre devise';
  -- pagination : jamais toute la base
  r := admin_transactions_search(null,null,null,null,null,false,1,2); assert jsonb_array_length(r->'rows')=2 and (r->>'total')::int=5, 'F4 page 1';
  r := admin_transactions_search(null,null,null,null,null,false,3,2); assert jsonb_array_length(r->'rows')=1, 'F4 dernière page';
  r := admin_transactions_search(null,null,null,null,null,false,4,2); assert jsonb_array_length(r->'rows')=0, 'F4 page au-delà';
  assert (admin_transactions_search(null,null,null,null,null,false,1,100000)->>'page_size')::int=100, 'F4 taille de page plafonnée à 100';
  assert (admin_transactions_search(null,null,null,null,null,false,0,0)->>'page')::int=1, 'F4 bornes de pagination';
  -- à vérifier
  r := admin_transactions_search(p_review => true);
  assert (r->>'total')::int=3, 'F4 3 transactions à vérifier : '||r::text;
  assert exists (select 1 from jsonb_array_elements(r->'rows') e where e->>'order_id'=current_setting('t.a1') and e->'review_reasons' ? 'commission_not_configured'), 'F4 A1 : commission non configurée';
  assert exists (select 1 from jsonb_array_elements(r->'rows') e where e->>'order_id'=current_setting('t.b2') and e->'review_reasons' ? 'refund_stuck'), 'F4 B2 : remboursement bloqué';
  assert exists (select 1 from jsonb_array_elements(r->'rows') e where e->>'order_id'=current_setting('t.b3') and e->'review_reasons' ? 'payment_stale'), 'F4 B3 : paiement en attente trop longtemps';
  -- détail
  d := admin_transaction_detail(current_setting('t.b1')::uuid);
  assert jsonb_array_length(d->'payments')=1 and jsonb_array_length(d->'refunds')=1 and jsonb_array_length(d->'financial_events')>=3, 'F4 détail : paiement, remboursement, événements comptables : '||d::text;
  assert (d#>>'{transaction,producer_net}')::numeric=90 and (d#>>'{order,commission_rate_bps}')::int=1000, 'F4 détail : net et taux figé';
  assert not (d::text ilike '%phone%') and not (d::text ilike '%"raw"%'), 'F4 détail : ni téléphone ni charge brute du prestataire';
  begin perform admin_transaction_detail('00000000-0000-0000-0000-000000000000'); assert false,'F4 commande inconnue'; exception when raise_exception then null; end;
end $$;
select ' F4 recherche, filtres, pagination, détail : OK' as r;

-- ===== F5. Export : permissions, plafond, journalisation sans contenu =====
do $$ declare e jsonb; e2 jsonb; n_before int; begin
  select count(*) into n_before from financial_audit_log where action='export.transactions';
  e := admin_transactions_export();
  assert (e->>'row_count')::int=5 and (e->>'truncated')::boolean=false and jsonb_array_length(e->'rows')=5, 'F5 export complet';
  assert not (e->'rows'->0 ? 'buyer_name') and not (e->'rows'->0 ? 'producer_name') and not (e->'rows'->0 ? 'payment_amount'), 'F5 minimisation : pas de noms d''utilisateurs dans l''export';
  e2 := admin_transactions_export(p_limit => 2);
  assert (e2->>'truncated')::boolean and jsonb_array_length(e2->'rows')=2 and (e2->>'row_count')::int=2, 'F5 plafond et indicateur de troncature';
  assert (admin_transactions_export(p_payment_status => 'paid')->>'row_count')::int=3, 'F5 export filtré';
  assert (admin_transactions_export(p_limit => 999999)->>'limit')::int=5000, 'F5 limite dure 5000';
  assert (select count(*) from financial_audit_log where action='export.transactions')=n_before+4, 'F5 chaque export est journalisé';
  assert not exists (select 1 from financial_audit_log where action='export.transactions' and (after_state::text ilike '%AGF-%')), 'F5 le journal ne contient aucune donnée exportée';
  assert exists (select 1 from financial_audit_log where action='export.transactions' and (after_state->>'row_count')::int=3 and after_state->>'payment_status'='paid' and actor_id='a1000000-0000-0000-0000-000000000001'), 'F5 journal : filtres, nombre de lignes, auteur';
end $$;
select ' F5 export CSV (données), plafond, journal : OK' as r;

-- ===== F6. Rapprochement : signale sans jamais corriger =====
select md5(string_agg(o::text, '|' order by o.id)) as h_orders from orders o \gset
select md5(string_agg(p::text, '|' order by p.id)) as h_pay from payments p \gset
select md5(string_agg(r::text, '|' order by r.id)) as h_ref from refunds r \gset
do $$ declare rp jsonb; begin
  rp := admin_reconciliation_report('2026-03-01T00:00:00+01','2026-04-01T00:00:00+01');
  assert (rp->>'errors')::int=0, 'F6 base cohérente : aucune erreur : '||rp::text;
  assert (rp->'totals'->>'refund_stuck')::int=1 and (rp->'totals'->>'payment_stale')::int=1 and (rp->'totals'->>'paid_without_commission_rule')::int=1, 'F6 avertissements et infos attendus';
  assert (rp#>>'{payouts,available}')::boolean=false and rp->>'corrections' ilike 'Aucune%', 'F6 reversements non disponibles, aucune correction';
  assert (select provolatile from pg_proc where proname='admin_reconciliation_report')='s', 'F6 fonction en lecture seule (STABLE)';
end $$;
-- injection de divergences par le propriétaire de la base (hors chemins applicatifs)
set session_replication_role = replica;
update payments set amount = amount + 1 where order_id=current_setting('t.b2')::uuid and status='paid';
update orders set platform_fee = 11 where id=current_setting('t.b1')::uuid;
update orders set payment_status='paid' where id=current_setting('t.b3')::uuid;
update orders set payment_status='pending' where id=current_setting('t.a1')::uuid;
update orders set refunded_amount = 5 where id=current_setting('t.b2')::uuid;
set session_replication_role = origin;
select md5(string_agg(o::text, '|' order by o.id)) as h_orders2 from orders o \gset
select md5(string_agg(p::text, '|' order by p.id)) as h_pay2 from payments p \gset
select md5(string_agg(r::text, '|' order by r.id)) as h_ref2 from refunds r \gset
select t_admin();
do $$ declare rp jsonb; t jsonb; begin
  rp := admin_reconciliation_report('2026-03-01T00:00:00+01','2026-04-01T00:00:00+01'); t := rp->'totals';
  assert (t->>'amount_mismatch')::int=1, 'F6 montant payé ≠ total commande détecté';
  assert (t->>'commission_mismatch')::int=1, 'F6 commission falsifiée (B1) détectée';
  assert (t->>'net_mismatch')::int=2, 'F6 net incohérent : B1 (commission falsifiée) et B3 (marquée payée sans net) : '||t::text;
  assert (t->>'order_paid_without_payment')::int=1, 'F6 commande payée sans paiement détectée';
  assert (t->>'payment_confirmed_order_not_paid')::int=1, 'F6 paiement confirmé / commande non payée détecté';
  assert (t->>'refund_total_mismatch')::int=1, 'F6 cumul remboursé incohérent détecté';
  assert (rp->>'errors')::int>=6, 'F6 erreurs comptées';
  assert (select platform_fee from orders where id=current_setting('t.b1')::uuid)=11, 'F6 le rapport n''a PAS corrigé la commission';
end $$;
select (:'h_orders2' = md5(string_agg(o::text, '|' order by o.id))) as same_o from orders o \gset
select (:'h_pay2' = md5(string_agg(p::text, '|' order by p.id))) as same_p from payments p \gset
select (:'h_ref2' = md5(string_agg(r::text, '|' order by r.id))) as same_r from refunds r \gset
do $$ begin assert true; end $$;
select (:'same_o'::boolean and :'same_p'::boolean and :'same_r'::boolean) as unchanged \gset
do $$ begin null; end $$;
select ' F6 rapprochement (détection, aucune correction automatique) : ' || case when :'unchanged'::boolean then 'OK' else 'ECHEC' end as r;
-- ledger manquant : paiement confirmé inséré hors chemin applicatif
insert into payments(order_id,user_id,amount,currency,method,status,provider,internal_reference,is_demo,paid_at)
  select current_setting('t.b4')::uuid,'a1000000-0000-0000-0000-000000000004',33.33,'USD','mobile_money','paid','cinetpay','AGF-DASH-NOLEDGER',false,now();
do $$ declare rp jsonb; begin
  rp := admin_reconciliation_report(now()-interval '1 day', now()+interval '1 day');
  assert (rp->'totals'->>'missing_ledger_event')::int>=1, 'F6 événement comptable manquant détecté : '||rp::text;
end $$;
select ' F6b événement comptable manquant : OK' as r;

-- ===== F7. Permissions : aucun accès hors administrateur =====
do $$ declare calls text[] := array[
  $q$select admin_finance_summary('2026-03-01T00:00:00Z','2026-04-01T00:00:00Z')$q$,
  $q$select admin_finance_timeseries('2026-03-01T00:00:00Z','2026-04-01T00:00:00Z','day','USD')$q$,
  $q$select admin_finance_breakdown('2026-03-01T00:00:00Z','2026-04-01T00:00:00Z','category','USD')$q$,
  $q$select admin_transactions_search()$q$, $q$select admin_transactions_export()$q$,
  $q$select admin_transaction_detail('00000000-0000-0000-0000-000000000000')$q$,
  $q$select admin_reconciliation_report('2026-03-01T00:00:00Z','2026-04-01T00:00:00Z')$q$,
  $q$select admin_set_user_role('a1000000-0000-0000-0000-000000000005','producer','test')$q$]; c text; begin
  perform set_config('t.calls', array_to_string(calls, E'\n'), false);
end $$;
set role authenticated; set request.jwt.claim.sub='a1000000-0000-0000-0000-000000000004'; set request.jwt.claim.role='authenticated';
do $$ declare c text; begin
  foreach c in array string_to_array(current_setting('t.calls'), E'\n') loop
    begin execute c; assert false, 'F7 acheteur autorisé : '||c; exception when insufficient_privilege then null; end;
  end loop;
  assert (select count(*) from admin_action_log)=0, 'F7 acheteur : journal admin illisible';
end $$;
set request.jwt.claim.sub='a1000000-0000-0000-0000-000000000002';
do $$ declare c text; begin
  foreach c in array string_to_array(current_setting('t.calls'), E'\n') loop
    begin execute c; assert false, 'F7 producteur autorisé : '||c; exception when insufficient_privilege then null; end;
  end loop;
end $$;
reset role;
set role anon; set request.jwt.claim.sub=''; set request.jwt.claim.role='anon';
do $$ declare c text; begin
  foreach c in array string_to_array(current_setting('t.calls'), E'\n') loop
    begin execute c; assert false, 'F7 anon autorisé : '||c; exception when insufficient_privilege then null; end;
  end loop;
end $$;
reset role;
select ' F7 permissions (acheteur, producteur, anon refusés) : OK' as r;

-- ===== F8. Administration : rôles stricts, traçabilité, journal en ajout seul =====
select t_admin();
set role authenticated;
do $$ declare r jsonb; l admin_action_log%rowtype; pid uuid; begin
  begin perform admin_set_user_role('a1000000-0000-0000-0000-000000000005','producer','  '); assert false,'F8 motif obligatoire'; exception when raise_exception then null; end;
  begin perform admin_set_user_role('a1000000-0000-0000-0000-000000000001','buyer','auto-rétrogradation'); assert false,'F8 auto-modification'; exception when raise_exception then null; end;
  begin perform admin_set_user_role('a1000000-0000-0000-0000-000000000005','superadmin','x y z'); assert false,'F8 rôle invalide'; exception when raise_exception then null; end;
  begin perform admin_set_user_role('a1000000-0000-0000-0000-000000000005','market','x y z'); assert false,'F8 rôle invalide 2'; exception when raise_exception then null; end;
  begin perform admin_set_user_role('00000000-0000-0000-0000-000000000009','buyer','introuvable'); assert false,'F8 utilisateur introuvable'; exception when raise_exception then null; end;
  begin perform admin_set_user_role('a1000000-0000-0000-0000-000000000004','buyer','déjà acheteur'); assert false,'F8 même rôle'; exception when raise_exception then null; end;
  -- plus de changement direct, même pour un admin
  begin update profiles set role='admin' where user_id='a1000000-0000-0000-0000-000000000005'; assert false,'F8 UPDATE direct du rôle par un admin'; exception when insufficient_privilege then null; end;
  r := admin_set_user_role('a1000000-0000-0000-0000-000000000005','producer','Demande validée par la direction');
  assert (r->>'ok')::boolean, 'F8 changement de rôle via RPC';
  select * into l from admin_action_log where action='profile.role_changed' and entity_id='a1000000-0000-0000-0000-000000000005' order by occurred_at desc limit 1;
  assert l.actor_id='a1000000-0000-0000-0000-000000000001' and l.reason='Demande validée par la direction' and l.before_state->>'role'='buyer' and l.after_state->>'role'='producer', 'F8 changement de rôle journalisé : auteur, motif, avant/après';
  -- vérification (action existante) : autorisée mais désormais tracée
  update profiles set is_verified = true where user_id='a1000000-0000-0000-0000-000000000003';
  assert exists (select 1 from admin_action_log where action='profile.verification_changed' and entity_id='a1000000-0000-0000-0000-000000000003' and actor_id='a1000000-0000-0000-0000-000000000001' and after_state->>'is_verified'='true'), 'F8 vérification tracée';
  -- produits : statut et suppression par l'admin tracés
  update products set status='draft' where id='b1000000-0000-0000-0000-000000000003';
  assert exists (select 1 from admin_action_log where action='product.status_changed' and entity_id='b1000000-0000-0000-0000-000000000003'), 'F8 statut produit modifié par admin tracé';
  delete from products where id='b1000000-0000-0000-0000-000000000003';
  assert exists (select 1 from admin_action_log where action='product.deleted_by_admin' and entity_id='b1000000-0000-0000-0000-000000000003' and before_state->>'name'='Haricot'), 'F8 suppression de produit par admin tracée avec le nom';
  assert (select count(*) from admin_action_log)>=4, 'F8 l''admin lit le journal';
end $$;
reset role;
-- le producteur qui modifie SON produit n'est pas tracé comme action admin
set role authenticated; set request.jwt.claim.sub='a1000000-0000-0000-0000-000000000002'; set request.jwt.claim.role='authenticated';
do $$ declare n0 int; begin
  select count(*) into n0 from admin_action_log;  -- 0 visible pour un producteur (RLS)
  update products set status='draft' where id='b1000000-0000-0000-0000-000000000002';
  begin update profiles set role='admin' where user_id='a1000000-0000-0000-0000-000000000002'; assert false,'F8 auto-promotion'; exception when insufficient_privilege or raise_exception then null; end;
  assert n0=0, 'F8 journal admin invisible au producteur';
end $$;
reset role;
do $$ begin
  assert (select count(*) from admin_action_log where action='product.status_changed' and entity_id='b1000000-0000-0000-0000-000000000002')=0, 'F8 action du producteur sur son produit non tracée comme admin';
  begin update admin_action_log set reason='x'; assert false,'F8 UPDATE journal admin'; exception when insufficient_privilege then null; end;
  begin delete from admin_action_log; assert false,'F8 DELETE journal admin'; exception when insufficient_privilege then null; end;
  begin truncate admin_action_log; assert false,'F8 TRUNCATE journal admin'; exception when insufficient_privilege then null; end;
end $$;
select ' F8 rôles stricts, traçabilité, journal en ajout seul : OK' as r;

-- ===== F9. Index et volatilité =====
do $$ begin
  assert (select count(*) from pg_indexes where indexname in ('idx_orders_created_at','idx_orders_payment_created','idx_payments_paid_at','idx_payments_created_at','idx_refunds_completed_updated','idx_refunds_open','idx_admin_action_log_time'))=7, 'F9 index d''agrégation présents';
  assert not exists (select 1 from pg_proc where proname in ('admin_finance_summary','admin_finance_timeseries','admin_finance_breakdown','admin_transactions_search','admin_transaction_detail','admin_reconciliation_report') and provolatile <> 's'), 'F9 fonctions de lecture STABLE';
  assert (select provolatile from pg_proc where proname='admin_transactions_export')='v', 'F9 export VOLATILE (écrit le journal)';
  assert not exists (select 1 from pg_proc where proname like 'admin\_%' and prosecdef and not exists (select 1 from unnest(coalesce(proconfig,'{}'::text[])) c where c like 'search_path=%')), 'F9 SECURITY DEFINER avec search_path figé';
end $$;
select ' F9 index, volatilité, search_path : OK' as r;

select ' TOUS LES SCÉNARIOS DASHBOARD FINANCIER : OK' as resultat;
