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

-- PASSE CINETPAY — Sécurité des paiements côté base : le navigateur ne peut rien marquer payé, lien référence ↔ commande,
-- montants/devises, paiements tardifs ou désordonnés, absence de chemin de démonstration, aucune clé dans la configuration.
select t_order('c3000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000002', 4, 25) as oa \gset
select t_order('c3000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000003', 10, 10) as ob \gset
select internal_reference as ref_a from payments where order_id=:'oa'::uuid \gset
select internal_reference as ref_b from payments where order_id=:'ob'::uuid \gset
select set_config('t.oa',:'oa',false), set_config('t.ob',:'ob',false), set_config('t.ref_a',:'ref_a',false), set_config('t.ref_b',:'ref_b',false) \gset

-- ===== C1. Le navigateur (acheteur, producteur, anon) ne peut modifier aucun statut financier =====
set role authenticated; set request.jwt.claim.sub='a1000000-0000-0000-0000-000000000004'; set request.jwt.claim.role='authenticated';
do $$ declare n int; begin
  begin update payments set status='paid' where order_id=current_setting('t.oa')::uuid; get diagnostics n=row_count; assert n=0,'C1 acheteur a modifié un paiement'; exception when insufficient_privilege then null; end;
  begin update orders set payment_status='paid' where id=current_setting('t.oa')::uuid; get diagnostics n=row_count; assert n=0,'C1 acheteur a marqué une commande payée'; exception when insufficient_privilege or raise_exception then null; end;
  begin insert into payments(order_id,user_id,amount,currency,method,status,provider,internal_reference,is_demo) values (current_setting('t.oa')::uuid,'a1000000-0000-0000-0000-000000000004',100,'USD','mobile_money','paid','cinetpay','AGF-FORGED',false); raise exception 'C1 insertion directe d''un paiement'; exception when insufficient_privilege then null; end;
  begin perform payment_apply_result(current_setting('t.ref_a'),'X','ACCEPTED',100,'USD','OM',null,'verify','evt-forged','{}'::jsonb); raise exception 'C1 payment_apply_result appelable par un acheteur'; exception when insufficient_privilege then null; end;
  begin perform payment_provider_attach((select id from payments where order_id=current_setting('t.oa')::uuid),'T','https://evil.example','{}'::jsonb); raise exception 'C1 payment_provider_attach appelable par un acheteur'; exception when insufficient_privilege then null; end;
  begin perform payment_initiation_release((select id from payments where order_id=current_setting('t.oa')::uuid)); raise exception 'C1 payment_initiation_release appelable par un acheteur'; exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claim.sub='a1000000-0000-0000-0000-000000000002';
do $$ declare n int; begin
  begin update payments set status='paid' where true; get diagnostics n=row_count; assert n=0,'C1 producteur a modifié un paiement'; exception when insufficient_privilege then null; end;
  begin perform payment_apply_result(current_setting('t.ref_a'),'X','ACCEPTED',100,'USD','OM',null,'verify','evt-forged2','{}'::jsonb); raise exception 'C1 producteur appelle payment_apply_result'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set role anon; set request.jwt.claim.sub=''; set request.jwt.claim.role='anon';
do $$ begin
  begin perform payment_apply_result(current_setting('t.ref_a'),'X','ACCEPTED',100,'USD','OM',null,'verify','evt-forged3','{}'::jsonb); raise exception 'C1 anon appelle payment_apply_result'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  assert (select payment_status from orders where id=current_setting('t.oa')::uuid)='pending' and (select status from payments where order_id=current_setting('t.oa')::uuid)='pending', 'C1 rien n''a été modifié par le navigateur';
  assert not exists (select 1 from payments where internal_reference='AGF-FORGED'), 'C1 aucun paiement forgé';
end $$;
select ' C1 le navigateur ne peut marquer aucun paiement ni commande comme payé : OK' as r;

-- ===== C2. Référence ↔ commande, montants, devises (service_role) =====
select t_as(null,'service_role');
do $$ declare r jsonb; ra text := current_setting('t.ref_a'); amt numeric; begin
  select amount into amt from payments where internal_reference=ra;
  r := payment_apply_result('AGF-PAY-INCONNU','X','ACCEPTED',100,'USD','OM',null,'webhook','evt-unk','{}'::jsonb);
  assert not (r->>'ok')::boolean, 'C2 référence inconnue acceptée : '||r::text;
  r := payment_apply_result(ra,'X','ACCEPTED',amt - 1,'USD','OM',null,'webhook','evt-low','{}'::jsonb);
  assert not (r->>'ok')::boolean and r->>'code'='AMOUNT_MISMATCH', 'C2 montant inférieur accepté : '||r::text;
  r := payment_apply_result(ra,'X','ACCEPTED',amt + 1,'USD','OM',null,'webhook','evt-high','{}'::jsonb);
  assert not (r->>'ok')::boolean and r->>'code'='AMOUNT_MISMATCH', 'C2 montant supérieur accepté';
  r := payment_apply_result(ra,'X','ACCEPTED',amt,'CDF','OM',null,'webhook','evt-cur','{}'::jsonb);
  assert not (r->>'ok')::boolean and r->>'code'='CURRENCY_MISMATCH', 'C2 devise incorrecte acceptée';
  r := payment_apply_result(ra,'X','ACCEPTED',null,null,'OM',null,'webhook','evt-null','{}'::jsonb);
  assert not (r->>'ok')::boolean, 'C2 montant/devise absents acceptés (jamais de confirmation sans montant)';
  r := payment_apply_result(ra,'X','ACCEPTED',(select amount from payments where internal_reference=current_setting('t.ref_b')) + 0.01,'USD','OM',null,'webhook','evt-cross','{}'::jsonb);
  assert not (r->>'ok')::boolean, 'C2 confirmation croisée';
  assert (select payment_status from orders where id=current_setting('t.oa')::uuid)='pending' and (select status from payments where internal_reference=ra)='pending', 'C2 aucune erreur ne doit avoir marqué la commande payée';
  assert (select count(*) from financial_events where order_id=current_setting('t.oa')::uuid and event_type='payment_confirmed')=0, 'C2 aucun événement comptable sans paiement confirmé';
end $$;
select ' C2 référence inconnue, montants et devises incorrects refusés : OK' as r;

-- ===== C3. États : en attente, confirmé, rejeu, notification désordonnée, une seule commission =====
do $$ declare r jsonb; ra text := current_setting('t.ref_a'); amt numeric; fee numeric; begin
  select amount into amt from payments where internal_reference=ra;
  r := payment_apply_result(ra,'X','WAITING_FOR_CUSTOMER',amt,'USD','OM',null,'webhook','evt-wait','{}'::jsonb);
  assert (r->>'ok')::boolean and (select status from payments where internal_reference=ra) in ('pending','processing') and (select provider_status from payments where internal_reference=ra)='WAITING_FOR_CUSTOMER', 'C3 en attente : statut du prestataire enregistré, jamais payé : '||r::text;
  assert (select payment_status from orders where id=current_setting('t.oa')::uuid)<>'paid', 'C3 en attente ≠ payé';
  r := payment_apply_result(ra,'X','ACCEPTED',amt,'USD','OM',null,'webhook','evt-ok','{}'::jsonb);
  assert (r->>'ok')::boolean and (select status from payments where internal_reference=ra)='paid' and (select payment_status from orders where id=current_setting('t.oa')::uuid)='paid', 'C3 confirmé : paid';
  select platform_fee into fee from orders where id=current_setting('t.oa')::uuid;
  r := payment_apply_result(ra,'X','ACCEPTED',amt,'USD','OM',null,'webhook','evt-ok','{}'::jsonb);
  assert (r->>'duplicate')::boolean, 'C3 rejeu = doublon : '||r::text;
  r := payment_apply_result(ra,'X','WAITING_FOR_CUSTOMER',amt,'USD','OM',null,'webhook','evt-wait-late','{}'::jsonb);
  assert (select status from payments where internal_reference=ra)='paid', 'C3 une notification « en attente » tardive ne fait pas régresser un paiement confirmé';
  r := payment_apply_result(ra,'X','REFUSED',amt,'USD','OM',null,'webhook','evt-refused-late','{}'::jsonb);
  assert (select status from payments where internal_reference=ra)='paid' and (select payment_status from orders where id=current_setting('t.oa')::uuid)='paid', 'C3 un refus tardif ne défait pas un paiement confirmé';
  r := payment_apply_result(ra,'X','ACCEPTED',amt,'USD','OM',null,'verify','evt-ok-verify','{}'::jsonb);
  assert (select count(*) from payments where order_id=current_setting('t.oa')::uuid and status='paid')=1, 'C3 un seul paiement payé par commande';
  assert (select count(*) from financial_events where order_id=current_setting('t.oa')::uuid and event_type='payment_confirmed')=1, 'C3 une seule confirmation financière';
  assert (select platform_fee from orders where id=current_setting('t.oa')::uuid)=fee, 'C3 commission inchangée par les rejeux (aucune duplication)';
  assert (select count(*) from financial_events where order_id=current_setting('t.oa')::uuid and event_type='commission_snapshot')=1, 'C3 un seul instantané de commission';
end $$;
do $$ declare r jsonb; rb text := current_setting('t.ref_b'); amt numeric; begin
  select amount into amt from payments where internal_reference=rb;
  r := payment_apply_result(rb,'X','REFUSED',amt,'USD','OM',null,'webhook','evt-ref','{}'::jsonb);
  assert (select status from payments where internal_reference=rb)='failed', 'C3 paiement refusé : failed : '||r::text;
  assert (select payment_status from orders where id=current_setting('t.ob')::uuid)<>'paid', 'C3 refusé ≠ payé';
  r := payment_apply_result(rb,'X','ACCEPTED',amt,'USD','OM',null,'webhook','evt-late-ok','{}'::jsonb);
  raise notice 'C3-INFO paiement confirmé après refus : ok=% statut=% commande=%', r->>'ok', (select status from payments where internal_reference=rb), (select payment_status from orders where id=current_setting('t.ob')::uuid);
end $$;
select ' C3 en attente, confirmé, rejeu, désordre, refus : OK' as r;

-- ===== C4. Lecture : isolation entre acheteurs, événements de paiement réservés =====
set role authenticated; set request.jwt.claim.sub='a1000000-0000-0000-0000-000000000005'; set request.jwt.claim.role='authenticated';
do $$ begin
  assert (select count(*) from payments)=0 and (select count(*) from payment_events)=0 and (select count(*) from orders)=0, 'C4 un tiers ne voit ni paiements, ni événements, ni commandes';
end $$;
set request.jwt.claim.sub='a1000000-0000-0000-0000-000000000004';
do $$ begin
  assert (select count(*) from payments where order_id=current_setting('t.oa')::uuid)=1, 'C4 l''acheteur voit son paiement';
  assert (select count(*) from payment_events)=0, 'C4 l''acheteur ne lit pas les événements bruts du prestataire';
end $$;
set request.jwt.claim.sub='a1000000-0000-0000-0000-000000000003';
do $$ begin
  assert (select count(*) from payments where order_id=current_setting('t.oa')::uuid)=0, 'C4 le producteur Deux ne voit pas le paiement de la commande du producteur Un';
  assert (select count(*) from payment_events)=0, 'C4 un producteur ne lit pas les événements bruts';
end $$;
reset role;
select ' C4 isolation des lectures : OK' as r;

-- ===== C5. Aucun chemin de démonstration ; configuration sans secret =====
do $$ declare f record; begin
  for f in select proname, prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' loop
    assert f.prosrc !~* 'insert\s+into\s+payments[^;]*(is_demo\s*,[^;]*true|demo_paid)', 'C5 la fonction '||f.proname||' peut créer un paiement de démonstration';
    assert f.prosrc !~* 'update\s+payments\s+set[^;]*status\s*=\s*''demo_paid''', 'C5 la fonction '||f.proname||' peut passer un paiement en demo_paid';
  end loop;
  assert not exists (select 1 from information_schema.columns where table_name='payment_settings' and column_name ~* '(key|secret|token|password)'), 'C5 aucune colonne de secret dans payment_settings';
  assert not exists (select 1 from information_schema.columns where table_schema='public' and table_name in ('payments','payment_events','orders') and column_name ~* '(api_?key|secret|password)'), 'C5 aucune colonne de secret dans les tables de paiement';
end $$;
set role authenticated; set request.jwt.claim.sub='a1000000-0000-0000-0000-000000000004'; set request.jwt.claim.role='authenticated';
do $$ declare m jsonb; begin
  m := get_payment_methods();
  assert not (m::text ~* '(api_?key|secret|site_?id|token)'), 'C5 get_payment_methods ne renvoie aucune clé : '||m::text;
  declare n int; begin
    update payment_settings set enabled_methods='["mobile_money","card"]'::jsonb; get diagnostics n = row_count;
    assert n = 0, 'C5 un acheteur a modifié la configuration des paiements ('||n||' ligne(s))';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  assert (select enabled_methods from payment_settings limit 1) = '["cash_on_delivery","mobile_money"]'::jsonb, 'C5 configuration des paiements inchangée';
end $$;
reset role;
select ' C5 pas de chemin de démo, aucune clé en base ni renvoyée : OK' as r;

-- ===== C6. Références uniques, liées à une seule commande =====
do $$ begin
  begin insert into payments(order_id,user_id,amount,currency,method,status,provider,internal_reference,is_demo) select order_id,user_id,amount,currency,method,'pending',provider,internal_reference,false from payments where order_id=current_setting('t.oa')::uuid limit 1; raise exception 'C6 référence dupliquée acceptée'; exception when unique_violation then null; end;
  assert (select count(*) from (select internal_reference from payments group by 1 having count(distinct order_id)>1) x)=0, 'C6 une référence ne peut viser qu''une commande';
end $$;
select ' C6 références uniques liées à une commande : OK' as r;

select ' TOUS LES SCÉNARIOS SÉCURITÉ DES PAIEMENTS : OK' as resultat;
