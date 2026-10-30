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

-- ===== V0. Calcul pur : pourcentage, arrondis, limites (numeric exact, demi vers le haut) =====
do $$ begin
  assert _commission_amount(100, 500) = 5.00, 'V0 5 % de 100';
  assert _commission_amount(0, 500) = 0, 'V0 assiette nulle';
  assert _commission_amount(0.01, 10000) = 0.01, 'V0 100 % de 0,01';
  assert _commission_amount(99999999.99, 10000) = 99999999.99, 'V0 grand montant 100 %';
  assert _commission_amount(33.33, 333) = 1.11, 'V0 33,33 x 3,33 % = 1,10989 -> 1,11';
  assert _commission_amount(0.05, 1000) = 0.01, 'V0 demi vers le haut (0,005 -> 0,01)';
  assert _commission_amount(0.04, 1250) = 0.01, 'V0 demi vers le haut (0,005 -> 0,01) bis';
  assert _commission_amount(99.99, 750) = 7.50, 'V0 99,99 x 7,5 % = 7,49925 -> 7,50';
  assert _commission_amount(100, 0) = 0, 'V0 taux 0';
  begin perform _commission_amount(-1, 500); assert false, 'V0 assiette négative acceptée'; exception when raise_exception then null; end;
  begin perform _commission_amount(1, 10001); assert false, 'V0 taux > 100 % accepté'; exception when raise_exception then null; end;
  begin perform _commission_amount(1, -1); assert false, 'V0 taux négatif accepté'; exception when raise_exception then null; end;
  begin perform _commission_amount(null, 500); assert false, 'V0 assiette NULL acceptée'; exception when raise_exception then null; end;
end $$;
select ' V0 calcul, arrondis, limites : OK' as r;


-- ===== V1. Aucune règle approuvée : rien d'inventé, le paiement n'est pas bloqué =====
do $$ declare o uuid; r jsonb; ord orders%rowtype; begin
  assert not exists (select 1 from commission_rules), 'V1 aucune règle par défaut dans la base';
  o := t_order('c1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001', 3, 33.33);
  select * into ord from orders where id=o;
  assert ord.commission_status='not_configured' and ord.platform_fee=0 and ord.commission_rate_bps is null and ord.commission_rule_id is null, 'V1 snapshot not_configured';
  assert ord.subtotal=99.99 and ord.total_amount=99.99, 'V1 totaux calculés par le serveur';
  r := t_pay(o,'EVT-V1');
  assert (r->>'ok')::boolean and r->>'status'='paid', 'V1 paiement accepté malgré l''absence de règle : '||r::text;
  select * into ord from orders where id=o;
  assert ord.payment_status='paid' and ord.seller_amount is null and ord.settlement_status='on_hold' and ord.platform_fee=0, 'V1 aucun net inventé, règlement on_hold';
  r := t_replay(o,'EVT-V1');
  assert (r->>'duplicate')::boolean, 'V1 rejeu du même webhook = doublon';
  assert (select count(*) from financial_events where order_id=o and event_type='payment_confirmed')=1, 'V1 un seul événement comptable';
  assert (select count(*) from payments where order_id=o and status='paid')=1, 'V1 un seul paiement payé';
end $$;
select ' V1 absence de règle (not_configured, on_hold, idempotence) : OK' as r;

-- ===== V2. Autorisations : seuls les administrateurs gèrent les règles =====
set role authenticated; set request.jwt.claim.sub='a1000000-0000-0000-0000-000000000004'; set request.jwt.claim.role='authenticated';
do $$ begin
  begin perform admin_create_commission_rule(500,null,'x'); assert false, 'V2 un acheteur a créé une règle'; exception when insufficient_privilege then null; end;
  begin perform admin_commission_overview(); assert false, 'V2 un acheteur lit la synthèse'; exception when insufficient_privilege then null; end;
  begin insert into commission_rules(rate_bps) values (500); assert false, 'V2 INSERT direct accepté'; exception when insufficient_privilege then null; end;
  assert (select count(*) from commission_rules)=0 and (select count(*) from financial_events)=0 and (select count(*) from financial_audit_log)=0, 'V2 acheteur ne lit aucun journal ni règle';
end $$;
set request.jwt.claim.sub='a1000000-0000-0000-0000-000000000002';
do $$ begin
  begin perform admin_create_commission_rule(500,null,'x'); assert false, 'V2 un producteur a créé une règle'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set role anon; set request.jwt.claim.sub=''; set request.jwt.claim.role='anon';
do $$ begin
  begin perform admin_create_commission_rule(500,null,'x'); assert false, 'V2 anon a créé une règle'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- admin : brouillon, validations de paramètres, aucune écriture directe même pour un admin
select t_admin();
set role authenticated;
do $$ declare r jsonb; d uuid; o uuid; ord orders%rowtype; begin
  begin perform admin_create_commission_rule(10001,null,null); assert false, 'V2 taux > 100 % accepté'; exception when raise_exception then null; end;
  begin perform admin_create_commission_rule(-1,null,null); assert false, 'V2 taux négatif accepté'; exception when raise_exception then null; end;
  begin perform admin_create_commission_rule(500,'inventée',null); assert false, 'V2 politique invalide acceptée'; exception when raise_exception then null; end;
  begin update commission_rules set rate_bps=1 where true; assert (select count(*) from commission_rules)=0; exception when insufficient_privilege then null; end;
  r := admin_create_commission_rule(750,null,'brouillon V2'); d := (r->>'id')::uuid;
  assert (select status from commission_rules where id=d)='draft', 'V2 la règle est un brouillon';
  -- un brouillon n'affecte AUCUNE commande
  assert (admin_commission_overview()->>'configured')::boolean = false, 'V2 synthèse : non configuré';
  reset role; o := t_order('c1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000001', 1, 33.33);
  select * into ord from orders where id=o;
  assert ord.commission_status='not_configured', 'V2 un brouillon ne s''applique pas';
  perform set_config('t.draft', d::text, false);
end $$;
reset role;
select ' V2 autorisations et brouillon inactif : OK' as r;

-- ===== V3. Approbation : référence obligatoire, pas d'antidatage, puis application =====
select t_admin();
do $$ declare d uuid := current_setting('t.draft')::uuid; r jsonb; o uuid; ord orders%rowtype; begin
  begin perform admin_approve_commission_rule(d,'  ',null); assert false, 'V3 approbation sans référence'; exception when raise_exception then null; end;
  begin perform admin_approve_commission_rule(d,'DECISION-TEST-001', now() - interval '1 day'); assert false, 'V3 antidatage accepté'; exception when raise_exception then null; end;
  r := admin_approve_commission_rule(d,'DECISION-TEST-001',null);
  assert (r->>'ok')::boolean, 'V3 approbation';
  begin perform admin_approve_commission_rule(d,'DECISION-TEST-001',null); assert false, 'V3 double approbation'; exception when raise_exception then null; end;
  assert (admin_commission_overview()->>'configured')::boolean, 'V3 synthèse : configuré';
  o := t_order('c1000000-0000-0000-0000-000000000003','b1000000-0000-0000-0000-000000000001', 3, 33.33);
  select * into ord from orders where id=o;
  assert ord.commission_status='computed' and ord.commission_rate_bps=750 and ord.commission_rule_id=d, 'V3 règle figée sur la commande';
  assert ord.commission_base=99.99 and ord.platform_fee=7.50, 'V3 commission = 99,99 x 7,5 % arrondi = 7,50';
  perform set_config('t.o3', o::text, false);
  -- paiement : net = produits - commission ; le montant demandé au prestataire n'inclut PAS la commission
  perform t_pay(o,'EVT-V3');
  select * into ord from orders where id=o;
  assert ord.payment_status='paid' and ord.seller_amount=92.49 and ord.settlement_status='pending', 'V3 net producteur = 99,99 - 7,50 = 92,49';
  assert (select amount from payments where order_id=o and status='paid')=ord.total_amount, 'V3 montant transmis au prestataire = total serveur';
  assert ord.total_amount = ord.subtotal + ord.delivery_fee, 'V3 total acheteur = produits + livraison (commission non ajoutée)';
  assert ord.platform_fee=7.50, 'V3 commission inchangée après paiement';
  -- rejeu : ni second paiement, ni seconde commission, ni second événement
  perform t_replay(o,'EVT-V3'); perform t_replay(o,'EVT-V3');
  select * into ord from orders where id=o;
  assert ord.platform_fee=7.50 and ord.seller_amount=92.49, 'V3 rejeux : montants identiques';
  assert (select count(*) from financial_events where order_id=o and event_type='payment_confirmed')=1, 'V3 un seul événement comptable après rejeux';
  assert (select count(*) from financial_events where order_id=o and event_type='commission_snapshot')=1, 'V3 un seul instantané';
end $$;
reset role;
select ' V3 approbation, application, net, idempotence : OK' as r;

-- ===== V4. Livraison et commission séparées (assiette = produits uniquement) =====
do $$ declare o uuid; ord orders%rowtype; begin
  insert into orders (buyer_id, producer_id, quantity, unit, subtotal, delivery_fee, total_amount, currency, status, payment_method, payment_status)
  values ('a1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000002', null, 'kg', 100, 10, 110, 'USD', 'pending', 'mobile_money', 'pending')
  returning id into o;
  select * into ord from orders where id=o;
  assert ord.commission_base=100 and ord.platform_fee=7.50, 'V4 assiette = 100 (produits), pas 110 ; commission 7,50';
  -- une tentative d''injecter des montants à l''insertion est écrasée par le serveur
  insert into orders (buyer_id, producer_id, quantity, unit, subtotal, delivery_fee, total_amount, currency, status, payment_method, payment_status, platform_fee, seller_amount, commission_rate_bps)
  values ('a1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000002', null, 'kg', 100, 0, 100, 'USD', 'pending', 'mobile_money', 'pending', 0, 999, 1)
  returning id into o;
  select * into ord from orders where id=o;
  assert ord.platform_fee=7.50 and ord.seller_amount is null and ord.commission_rate_bps=750, 'V4 taux/commission/net imposés par le client écrasés';
end $$;
select ' V4 livraison hors assiette, valeurs client écrasées : OK' as r;

-- ===== V5. Historique figé après changement de taux ; retrait de règle =====
select t_admin();
do $$ declare o3 uuid := current_setting('t.o3')::uuid; r1 uuid; r2 uuid; o uuid; ord orders%rowtype; old_before orders%rowtype; begin
  select * into old_before from orders where id=o3;
  r1 := (select id from commission_rules where status='approved');
  perform pg_sleep(0.05);
  r2 := (admin_create_commission_rule(1000,null,'taux V5')->>'id')::uuid;
  perform admin_approve_commission_rule(r2,'DECISION-TEST-002',null);
  o := t_order('c1000000-0000-0000-0000-000000000004','b1000000-0000-0000-0000-000000000001', 3, 33.33);
  select * into ord from orders where id=o;
  assert ord.commission_rate_bps=1000 and ord.commission_rule_id=r2 and ord.platform_fee=10.00, 'V5 nouvelle commande = nouveau taux (10 % de 99,99 = 9,999 -> 10,00)';
  select * into ord from orders where id=o3;
  assert ord.commission_rate_bps=750 and ord.platform_fee=old_before.platform_fee and ord.seller_amount=old_before.seller_amount and ord.commission_rule_id=r1, 'V5 ancienne commande INCHANGÉE';
  perform set_config('t.r1', r1::text, false); perform set_config('t.r2', r2::text, false);
  -- retrait de la règle la plus récente : retour à la précédente ; retrait de toutes : état sûr
  perform t_admin();
  begin perform admin_retire_commission_rule(r2,'x'); assert false, 'V5 motif trop court'; exception when raise_exception then null; end;
  perform admin_retire_commission_rule(r2,'retour au taux précédent');
  perform t_admin();
  o := t_order('c1000000-0000-0000-0000-000000000005','b1000000-0000-0000-0000-000000000001', 1, 33.33); perform t_admin();
  assert (select commission_rate_bps from orders where id=o)=750, 'V5 retrait : retour à la règle approuvée précédente';
  perform admin_retire_commission_rule(r1,'arrêt de la commission');
  o := t_order('c1000000-0000-0000-0000-000000000006','b1000000-0000-0000-0000-000000000001', 1, 33.33);
  assert (select commission_status from orders where id=o)='not_configured', 'V5 plus aucune règle : not_configured (état sûr)';
  select * into ord from orders where id=o3;
  assert ord.platform_fee=old_before.platform_fee and ord.commission_rate_bps=750, 'V5 historique intact après retrait';
end $$;
reset role;
select ' V5 historique figé, retrait de règle : OK' as r;

-- ===== V6. Intégrité : personne ne réécrit directement une commission =====
do $$ declare o3 uuid := current_setting('t.o3')::uuid; begin
  perform t_as('a1000000-0000-0000-0000-000000000004');
  begin update orders set platform_fee=0 where id=o3; assert false, 'V6 acheteur a modifié platform_fee'; exception when insufficient_privilege or raise_exception then null; end;
end $$;
set role authenticated; set request.jwt.claim.sub='a1000000-0000-0000-0000-000000000004'; set request.jwt.claim.role='authenticated';
do $$ declare o3 uuid := current_setting('t.o3')::uuid; n int; begin
  begin update orders set platform_fee=0, seller_amount=99.99 where id=o3; get diagnostics n = row_count; assert n=0, 'V6 acheteur a modifié la commission'; exception when insufficient_privilege or raise_exception then null; end;
end $$;
set request.jwt.claim.sub='a1000000-0000-0000-0000-000000000002';
do $$ declare o3 uuid := current_setting('t.o3')::uuid; n int; begin
  begin update orders set platform_fee=0, seller_amount=99.99, settlement_status='settled' where id=o3; get diagnostics n = row_count; assert n=0, 'V6 producteur a modifié la commission'; exception when insufficient_privilege or raise_exception then null; end;
end $$;
reset role;
select t_admin();
set role authenticated;
do $$ declare o3 uuid := current_setting('t.o3')::uuid; begin
  begin update orders set platform_fee=0 where id=o3; assert false, 'V6 même un admin réécrit la commission en direct'; exception when insufficient_privilege then null; end;
  begin update orders set commission_rate_bps=1 where id=o3; assert false, 'V6 admin réécrit le taux figé'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ declare o3 uuid := current_setting('t.o3')::uuid; begin
  assert (select platform_fee from orders where id=o3)=7.50 and (select seller_amount from orders where id=o3)=92.49, 'V6 montants intacts';
end $$;
select ' V6 réécriture directe refusée (acheteur, producteur, admin) : OK' as r;

-- ===== V7. Journaux en ajout seul =====
do $$ begin
  begin update financial_events set amount=0; assert false, 'V7 UPDATE du journal comptable'; exception when insufficient_privilege then null; end;
  begin delete from financial_events; assert false, 'V7 DELETE du journal comptable'; exception when insufficient_privilege then null; end;
  begin truncate financial_events; assert false, 'V7 TRUNCATE du journal comptable'; exception when insufficient_privilege then null; end;
  begin update financial_audit_log set action='x'; assert false, 'V7 UPDATE audit'; exception when insufficient_privilege then null; end;
  begin delete from financial_audit_log; assert false, 'V7 DELETE audit'; exception when insufficient_privilege then null; end;
  assert exists (select 1 from financial_audit_log where action='commission_rule.created' and actor_id='a1000000-0000-0000-0000-000000000001'), 'V7 création auditée avec l''auteur';
  assert exists (select 1 from financial_audit_log where action='commission_rule.approved' and after_state->>'validation_reference'='DECISION-TEST-001'), 'V7 approbation auditée avec la référence';
  assert exists (select 1 from financial_audit_log where action='commission_rule.retired'), 'V7 retrait audité';
end $$;
select ' V7 journaux en ajout seul + audit : OK' as r;

-- ===== V8. Remboursements : total, partiel, échec, politique non décidée =====
select t_admin();
do $$ declare r jsonb; d uuid; o uuid; o2 uuid; ord orders%rowtype; f record; rf uuid; begin
  -- règle avec politique « proportionnelle » (décision simulée pour le test)
  d := (admin_create_commission_rule(1000,'proportional','V8')->>'id')::uuid;
  perform admin_approve_commission_rule(d,'DECISION-TEST-003',null);
  o := t_order('c1000000-0000-0000-0000-000000000007','b1000000-0000-0000-0000-000000000002', 4, 25);  -- 100,00 ; commission 10,00
  perform t_pay(o,'EVT-V8');
  select * into ord from orders where id=o;
  assert ord.platform_fee=10.00 and ord.seller_amount=90.00, 'V8 base 100 : commission 10, net 90';
  -- demande seule : rien n'est remboursé
  insert into refunds(order_id,payment_id,requested_by,amount,currency) values (o,(select id from payments where order_id=o and status='paid'),'a1000000-0000-0000-0000-000000000001',40,'USD') returning id into rf;
  assert (select refunded_amount from orders where id=o)=0, 'V8 une demande n''est pas un remboursement';
  assert exists (select 1 from financial_events where refund_id=rf and event_type='refund_requested'), 'V8 demande journalisée';
  perform t_admin(); perform admin_process_refund(rf,'processing','R1');
  assert (select refunded_amount from orders where id=o)=0, 'V8 « processing » n''est pas non plus un remboursement réussi';
  -- échec du prestataire : aucun montant remboursé
  perform admin_process_refund(rf,'failed','R1');
  assert (select refunded_amount from orders where id=o)=0 and exists (select 1 from financial_events where refund_id=rf and event_type='refund_failed'), 'V8 échec : rien remboursé, événement tracé';
  -- remboursement partiel réussi : 40 -> commission annulée 4,00 ; net après = 90 - (40 - 4) = 54
  rf := t_refund(o, 40, 'completed');
  select * into ord from orders where id=o;
  assert ord.refunded_amount=40 and ord.commission_reversed=4.00, 'V8 partiel : 40 remboursés, commission annulée 4,00';
  assert ord.platform_fee=10.00 and ord.seller_amount=90.00, 'V8 montants d''origine conservés';
  select * into f from order_financials where order_id=o;
  assert f.producer_net_after_refund=54.00 and f.platform_commission=10.00, 'V8 net après remboursement = 54,00';
  -- remboursement du reste (60) : total
  rf := t_refund(o, 60, 'completed');
  select * into ord from orders where id=o;
  assert ord.refunded_amount=100 and ord.commission_reversed=10.00, 'V8 total : 100 remboursés, commission annulée 10,00';
  select * into f from order_financials where order_id=o;
  assert f.producer_net_after_refund=0, 'V8 net après remboursement total = 0';
  -- impossible de rembourser plus que le payé
  begin perform t_refund(o, 1, 'completed'); assert false, 'V8 sur-remboursement accepté'; exception when check_violation then null; end;
  assert (select refunded_amount from orders where id=o)=100, 'V8 cumul plafonné au total payé';
  -- politique NON décidée : on ne devine pas
  perform admin_retire_commission_rule(d,'fin du test V8');
  d := (admin_create_commission_rule(1000,null,'V8 sans politique')->>'id')::uuid;
  perform admin_approve_commission_rule(d,'DECISION-TEST-004',null);
  o2 := t_order('c1000000-0000-0000-0000-000000000008','b1000000-0000-0000-0000-000000000002', 4, 25);
  perform t_pay(o2,'EVT-V8B');
  perform t_refund(o2, 50, 'completed'); perform t_admin();
  select * into ord from orders where id=o2;
  assert ord.refunded_amount=50 and ord.commission_reversed is null and ord.commission_refund_policy is null, 'V8 politique non décidée : commission_reversed reste NULL (à arbitrer)';
  select * into f from order_financials where order_id=o2;
  assert f.producer_net_after_refund is null, 'V8 net après remboursement non calculé sans politique';
end $$;
reset role;
select ' V8 remboursements (demande, échec, partiel, total, plafond, politique non décidée) : OK' as r;

-- ===== V9. Isolation RLS de la vue financière et des commandes =====
do $$ declare o3 uuid := current_setting('t.o3')::uuid; begin
  perform 1;
end $$;
set role authenticated; set request.jwt.claim.sub='a1000000-0000-0000-0000-000000000004'; set request.jwt.claim.role='authenticated';
do $$ declare o3 uuid := current_setting('t.o3')::uuid; f record; begin
  select * into f from order_financials where order_id=o3;
  assert f.order_id is not null and f.items_subtotal=99.99 and f.buyer_total=99.99, 'V9 acheteur voit prix et total';
  assert f.platform_commission is null and f.producer_net is null and f.commission_rate_bps is null and f.commission_status is null, 'V9 commission masquée à l''acheteur dans la vue';
end $$;
set request.jwt.claim.sub='a1000000-0000-0000-0000-000000000005';
do $$ begin assert (select count(*) from order_financials)=0 and (select count(*) from orders)=0, 'V9 un tiers ne voit aucune commande'; end $$;
set request.jwt.claim.sub='a1000000-0000-0000-0000-000000000003';
do $$ begin assert (select count(*) from order_financials where producer_id<>auth.uid())=0 and (select count(*) from order_financials where producer_id=auth.uid())=0, 'V9 le producteur Deux ne voit pas les ventes du producteur Un'; end $$;
set request.jwt.claim.sub='a1000000-0000-0000-0000-000000000002';
do $$ declare o3 uuid := current_setting('t.o3')::uuid; f record; begin
  select * into f from order_financials where order_id=o3;
  assert f.platform_commission=7.50 and f.producer_net=92.49 and f.commission_rate_bps=750, 'V9 le producteur Un voit sa commission et son net';
  assert (select count(*) from financial_events)=0, 'V9 le producteur ne lit pas le journal comptable';
end $$;
reset role;
select t_admin(); set role authenticated;
do $$ begin
  assert (select count(*) from order_financials)>=8 and (select count(*) from financial_events)>=8 and (select count(*) from financial_audit_log)>=8, 'V9 l''administrateur lit tout';
end $$;
reset role;
select ' V9 isolation RLS (acheteur, tiers, autre producteur, admin) : OK' as r;

-- ===== V10. Plusieurs producteurs dans un même panier : un instantané par commande =====
do $$ declare r jsonb; begin
  perform t_as('a1000000-0000-0000-0000-000000000004');
  r := create_order_from_cart('c1000000-0000-0000-0000-000000000009'::uuid,
    jsonb_build_array(jsonb_build_object('product_id','b1000000-0000-0000-0000-000000000001','quantity',3),
                      jsonb_build_object('product_id','b1000000-0000-0000-0000-000000000003','quantity',10)),
    '{"recipient_name":"Resto Test","recipient_phone":"+243812345678","address":"Av. 1","city":"Kinshasa","commune":"Gombe","instructions":""}'::jsonb,
    'mobile_money', 199.99);
  assert (r->>'ok')::boolean and jsonb_array_length(r->'orders')=2, 'V10 deux commandes (une par producteur) : '||r::text;
  assert (select count(*) from orders where checkout_id='c1000000-0000-0000-0000-000000000009' and commission_status='computed' and commission_rate_bps=1000)=2, 'V10 chaque commande a son instantané';
  assert (select sum(platform_fee) from orders where checkout_id='c1000000-0000-0000-0000-000000000009')=10.00+10.00, 'V10 commissions : 10,00 (99,99) + 10,00 (100)';
end $$;
select ' V10 panier multi-producteurs : OK' as r;

select ' TOUS LES SCÉNARIOS MOTEUR DE COMMISSIONS : OK' as resultat;
