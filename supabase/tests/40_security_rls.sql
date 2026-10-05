-- Passe 24 — Sécurité / RLS : ce que chaque rôle ne doit PAS pouvoir faire. Toute assertion échouée arrête le script.
\set ON_ERROR_STOP on
\set QUIET on

insert into auth.users(id,email,raw_user_meta_data) values
 ('a3000000-0000-0000-0000-000000000001','p1@s.cd','{"role":"producer","full_name":"Producteur 1"}'),
 ('a3000000-0000-0000-0000-000000000002','p2@s.cd','{"role":"producer","full_name":"Producteur 2"}'),
 ('b3000000-0000-0000-0000-000000000001','b1@s.cd','{"role":"buyer","full_name":"Acheteur 1"}'),
 ('b3000000-0000-0000-0000-000000000002','b2@s.cd','{"role":"buyer","full_name":"Acheteur 2"}'),
 ('c3000000-0000-0000-0000-000000000001','adm@s.cd','{"role":"buyer","full_name":"Admin S"}');
update profiles set role='admin', phone='+243800000099' where user_id='c3000000-0000-0000-0000-000000000001';
update profiles set phone='+243800000001' where user_id='b3000000-0000-0000-0000-000000000001';
insert into products(id,user_id,name,category,quantity,unit,price,currency,city,status) values
 ('d3000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','Maïs','cereals',100,'kg',1,'USD','Kinshasa','available'),
 ('d3000000-0000-0000-0000-000000000002','a3000000-0000-0000-0000-000000000002','Riz','cereals',100,'kg',1,'USD','Kinshasa','available');

-- Exécute une requête sous un rôle et renvoie 'ok:<lignes>' ou 'err:<SQLSTATE>'. Rôle restauré dans tous les cas.
create function pg_temp.run_as(p_role text, p_uid text, p_sql text) returns text language plpgsql as $f$
declare n integer;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid, ''), false);
  perform set_config('request.jwt.claim.role', case when p_role = 'anon' then 'anon' when p_role = 'service_role' then 'service_role' else 'authenticated' end, false);
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
    get diagnostics n = row_count;
    reset role;
    return 'ok:' || n;
  exception when others then
    reset role;
    return 'err:' || sqlstate;
  end;
end $f$;

-- « refusé » = erreur de privilège / de policy, ou aucune ligne touchée / visible
create function pg_temp.denied(r text) returns boolean language sql as $f$ select r in ('ok:0', 'err:42501', 'err:P0001') $f$;

-- commande réelle de l'acheteur 1 chez le producteur 1
do $$ declare r jsonb; begin
  perform set_config('request.jwt.claim.sub','b3000000-0000-0000-0000-000000000001',false);
  perform set_config('request.jwt.claim.role','authenticated',false);
  set local role authenticated;
  r := create_order_from_cart('31000000-0000-0000-0000-000000000000'::uuid,
    '[{"product_id":"d3000000-0000-0000-0000-000000000001","quantity":5}]'::jsonb,
    '{"recipient_name":"Acheteur Un","recipient_phone":"+243812345678","address":"Avenue Test 1","city":"Kinshasa"}'::jsonb,'cash_on_delivery',null);
  reset role;
  assert r->>'ok' = 'true', 'commande de départ : ' || r::text;
  perform set_config('t.order', r #>> '{orders,0,id}', false);
end $$;

-- ===================================================== anon
do $$ declare t text; begin
  foreach t in array array['orders','order_items','payments','refunds','notifications','messages','order_events','notification_deliveries','payment_events','favorites','user_plots'] loop
    assert pg_temp.denied(pg_temp.run_as('anon', null, format('select 1 from %I', t))), 'anon ne doit pas lire ' || t || ' : ' || pg_temp.run_as('anon', null, format('select 1 from %I', t));
  end loop;
  assert pg_temp.run_as('anon', null, 'select 1 from products where status=''available''') = 'ok:2', 'anon lit les produits disponibles (marketplace public)';
  assert pg_temp.denied(pg_temp.run_as('anon', null, 'insert into products(user_id,name,category,quantity,unit,price) values (''a3000000-0000-0000-0000-000000000001'',''X'',''cereals'',1,''kg'',1)')), 'anon ne publie pas de produit';
end $$;
select 'anon : OK' as test;

-- ===================================================== acheteur contre acheteur / producteur contre producteur
do $$ begin
  assert pg_temp.denied(pg_temp.run_as('authenticated','b3000000-0000-0000-0000-000000000002', 'update profiles set full_name=''Pirate'' where user_id=''b3000000-0000-0000-0000-000000000001''')), 'un acheteur ne modifie pas le profil d''un autre';
  assert (select full_name from profiles where user_id='b3000000-0000-0000-0000-000000000001') = 'Acheteur 1', 'profil intact';
  assert pg_temp.denied(pg_temp.run_as('authenticated','a3000000-0000-0000-0000-000000000002', 'update products set price=0.01 where id=''d3000000-0000-0000-0000-000000000001''')), 'un producteur ne modifie pas le produit d''un autre';
  assert pg_temp.denied(pg_temp.run_as('authenticated','a3000000-0000-0000-0000-000000000002', 'delete from products where id=''d3000000-0000-0000-0000-000000000001''')), 'un producteur ne supprime pas le produit d''un autre';
  assert (select price from products where id='d3000000-0000-0000-0000-000000000001') = 1, 'prix intact';
  assert pg_temp.denied(pg_temp.run_as('authenticated','b3000000-0000-0000-0000-000000000001', 'insert into products(user_id,name,category,quantity,unit,price) values (''b3000000-0000-0000-0000-000000000001'',''Faux'',''cereals'',1,''kg'',1)')), 'un acheteur ne publie pas d''offre';
  assert pg_temp.denied(pg_temp.run_as('authenticated','a3000000-0000-0000-0000-000000000002', 'insert into products(user_id,name,category,quantity,unit,price) values (''a3000000-0000-0000-0000-000000000001'',''Usurpation'',''cereals'',1,''kg'',1)')), 'un producteur ne publie pas au nom d''un autre';
end $$;
select 'acheteur/producteur : OK' as test;

-- ===================================================== élévation de privilège
do $$ begin
  perform pg_temp.run_as('authenticated','b3000000-0000-0000-0000-000000000001', 'update profiles set role=''admin'' where user_id=''b3000000-0000-0000-0000-000000000001''');
  assert (select role from profiles where user_id='b3000000-0000-0000-0000-000000000001') = 'buyer', 'un utilisateur ne devient pas admin';
  perform pg_temp.run_as('authenticated','a3000000-0000-0000-0000-000000000001', 'update profiles set is_verified=true where user_id=''a3000000-0000-0000-0000-000000000001''');
  assert (select is_verified from profiles where user_id='a3000000-0000-0000-0000-000000000001') = false, 'un utilisateur ne se vérifie pas lui-même';
  assert pg_temp.denied(pg_temp.run_as('authenticated','b3000000-0000-0000-0000-000000000001', 'insert into profiles(user_id,role,full_name) values (gen_random_uuid(),''admin'',''Faux admin'')')), 'création d''un profil admin refusée';
end $$;
select 'élévation de privilège : OK' as test;

-- ===================================================== paiement : aucune écriture client
do $$ declare oid uuid := current_setting('t.order')::uuid; r text; begin
  assert pg_temp.denied(pg_temp.run_as('authenticated','b3000000-0000-0000-0000-000000000001', format('update orders set payment_status=''paid'' where id=%L', oid))), 'l''acheteur ne marque pas sa commande payée';
  assert pg_temp.denied(pg_temp.run_as('authenticated','b3000000-0000-0000-0000-000000000001', format('update orders set total_amount=0.01 where id=%L', oid))), 'l''acheteur ne modifie pas le montant';
  assert pg_temp.denied(pg_temp.run_as('authenticated','a3000000-0000-0000-0000-000000000001', format('update orders set status=''completed'' where id=%L', oid))), 'le producteur ne force pas le statut hors RPC';
  assert pg_temp.denied(pg_temp.run_as('authenticated','b3000000-0000-0000-0000-000000000001', format('update payments set status=''paid'' where order_id=%L', oid))), 'l''acheteur ne marque pas le paiement payé';
  assert pg_temp.denied(pg_temp.run_as('authenticated','b3000000-0000-0000-0000-000000000001', format('update payments set amount=0.01 where order_id=%L', oid))), 'l''acheteur ne modifie pas le montant du paiement';
  assert pg_temp.denied(pg_temp.run_as('authenticated','b3000000-0000-0000-0000-000000000001', format('insert into payments(order_id,user_id,amount,currency,method,status) values (%L,%L,1,''USD'',''mobile_money'',''paid'')', oid, 'b3000000-0000-0000-0000-000000000001'))), 'l''acheteur ne crée pas un paiement payé';
  assert pg_temp.denied(pg_temp.run_as('authenticated','b3000000-0000-0000-0000-000000000001', format('insert into refunds(order_id,payment_id,requested_by,amount,currency,status) select %L, id, %L, 1, ''USD'', ''completed'' from payments where order_id=%L', oid, 'b3000000-0000-0000-0000-000000000001', oid))), 'l''acheteur ne crée pas un remboursement terminé';
  assert pg_temp.denied(pg_temp.run_as('authenticated','b3000000-0000-0000-0000-000000000001', format('insert into order_events(order_id,event_type) values (%L,''producer_confirmed'')', oid))), 'le journal d''événements n''est pas inscriptible par un client';
  assert pg_temp.denied(pg_temp.run_as('authenticated','a3000000-0000-0000-0000-000000000001', format('update orders set confirmation_deadline=now()+interval ''30 days'' where id=%L', oid))), 'le producteur ne repousse pas l''échéance';
  -- appels RPC de paiement réservés au service_role
  foreach r in array array[
    'select payment_apply_result(''X'',''X'',''ACCEPTED'',1,''USD'',null,null,''webhook'',''E1'',null)',
    'select payment_provider_attach(gen_random_uuid(),''T'',''https://x'',null)',
    'select payment_initiation_release(gen_random_uuid())',
    'select run_order_confirmation_maintenance()',
    'select _order_confirmation_maintenance()',
    'select _notify(gen_random_uuid(),''x'',''t'',''b'',''/'',''k'')',
    'select _log_order_event(gen_random_uuid(),''x'',null,''{}''::jsonb,null)',
    'select producer_accepting(gen_random_uuid())',
    'select notifications_pending_email()',
    'select record_notification_delivery(gen_random_uuid(),''email'',''x'',''sent'',null)'
  ] loop
    assert pg_temp.run_as('authenticated','b3000000-0000-0000-0000-000000000001', r) = 'err:42501', 'fonction interne exécutable par un client : ' || r || ' -> ' || pg_temp.run_as('authenticated','b3000000-0000-0000-0000-000000000001', r);
    assert pg_temp.run_as('anon', null, r) = 'err:42501', 'fonction interne exécutable par anon : ' || r;
  end loop;
end $$;
select 'paiement / fonctions internes : OK' as test;

-- ===================================================== lecture par un tiers
do $$ declare oid uuid := current_setting('t.order')::uuid; begin
  assert pg_temp.run_as('authenticated','b3000000-0000-0000-0000-000000000002', format('select 1 from orders where id=%L', oid)) = 'ok:0', 'un tiers ne lit pas la commande';
  assert pg_temp.run_as('authenticated','b3000000-0000-0000-0000-000000000002', format('select 1 from order_items where order_id=%L', oid)) = 'ok:0', 'un tiers ne lit pas les lignes de commande';
  assert pg_temp.run_as('authenticated','b3000000-0000-0000-0000-000000000002', format('select 1 from payments where order_id=%L', oid)) = 'ok:0', 'un tiers ne lit pas les paiements';
  assert pg_temp.run_as('authenticated','b3000000-0000-0000-0000-000000000002', format('select 1 from order_events where order_id=%L', oid)) = 'ok:0', 'un tiers ne lit pas le journal';
  assert pg_temp.run_as('authenticated','b3000000-0000-0000-0000-000000000002', format('select 1 from deliveries where order_id=%L', oid)) = 'ok:0', 'un tiers ne lit pas la livraison';
  assert pg_temp.run_as('authenticated','b3000000-0000-0000-0000-000000000002', format('select 1 from order_status_history where order_id=%L', oid)) = 'ok:0', 'un tiers ne lit pas l''historique';
  assert pg_temp.run_as('authenticated','b3000000-0000-0000-0000-000000000001', format('select 1 from orders where id=%L', oid)) = 'ok:1', 'l''acheteur lit sa commande';
  assert pg_temp.run_as('authenticated','a3000000-0000-0000-0000-000000000001', format('select 1 from orders where id=%L', oid)) = 'ok:1', 'le producteur lit sa commande';
  assert pg_temp.run_as('authenticated','a3000000-0000-0000-0000-000000000002', format('select 1 from orders where id=%L', oid)) = 'ok:0', 'un AUTRE producteur ne lit pas la commande';
  assert pg_temp.run_as('authenticated','c3000000-0000-0000-0000-000000000001', format('select 1 from orders where id=%L', oid)) = 'ok:1', 'l''admin lit la commande';
end $$;
select 'lecture par un tiers : OK' as test;

-- alternatives : un tiers reçoit ORDER_NOT_FOUND (retour jsonb, pas d'exception)
do $$ declare c text; begin
  perform set_config('request.jwt.claim.sub','b3000000-0000-0000-0000-000000000002',false);
  perform set_config('request.jwt.claim.role','authenticated',false);
  set local role authenticated;
  c := order_alternatives(current_setting('t.order')::uuid) ->> 'code';
  reset role;
  assert c = 'ORDER_NOT_FOUND', 'un tiers ne lit pas les alternatives d''une commande : ' || coalesce(c, 'null');
end $$;
select 'alternatives d''un tiers : OK' as test;

-- ===================================================== téléphone
do $$ begin
  assert pg_temp.run_as('authenticated','b3000000-0000-0000-0000-000000000002','select phone from profiles') = 'err:42501', 'la colonne phone n''est pas lisible directement';
  assert pg_temp.run_as('anon', null, 'select phone from profiles') = 'err:42501', 'anon ne lit pas phone';
  assert pg_temp.run_as('authenticated','b3000000-0000-0000-0000-000000000002','select * from profiles') = 'err:42501', 'select * est refusé (colonne phone protégée)';
end $$;
do $$ declare ph text; begin
  perform set_config('request.jwt.claim.sub','b3000000-0000-0000-0000-000000000002',false);
  perform set_config('request.jwt.claim.role','authenticated',false);
  set local role authenticated;
  ph := get_profile_phone('b3000000-0000-0000-0000-000000000001');
  reset role;
  assert ph is null, 'un tiers sans lien avec l''utilisateur n''obtient pas son téléphone';
  perform set_config('request.jwt.claim.sub','a3000000-0000-0000-0000-000000000001',false);
  set local role authenticated;
  ph := get_profile_phone('b3000000-0000-0000-0000-000000000001');
  reset role;
  assert ph = '+243800000001', 'le producteur d''une commande peut joindre son acheteur : ' || coalesce(ph, 'null');
end $$;
select 'téléphone : OK' as test;

-- ===================================================== notifications
do $$ begin
  insert into notifications(user_id,type,title) values ('b3000000-0000-0000-0000-000000000001','info','pour acheteur 1');
  assert pg_temp.run_as('authenticated','b3000000-0000-0000-0000-000000000002','select 1 from notifications where user_id=''b3000000-0000-0000-0000-000000000001''') = 'ok:0', 'on ne lit pas les notifications d''un autre';
  assert pg_temp.denied(pg_temp.run_as('authenticated','b3000000-0000-0000-0000-000000000002','insert into notifications(user_id,type,title) values (''b3000000-0000-0000-0000-000000000001'',''info'',''faux'')')), 'on ne crée pas de notification pour un autre';
  assert pg_temp.denied(pg_temp.run_as('authenticated','b3000000-0000-0000-0000-000000000002','update notifications set is_read=true where user_id=''b3000000-0000-0000-0000-000000000001''')), 'on ne marque pas lue la notification d''un autre';
  assert pg_temp.run_as('authenticated','b3000000-0000-0000-0000-000000000001','update notifications set is_read=true where user_id=''b3000000-0000-0000-0000-000000000001''') like 'ok:%', 'on marque ses propres notifications';
end $$;
select 'notifications : OK' as test;

-- ===================================================== Storage
do $$ begin
  assert (select file_size_limit from storage.buckets where id='product-images') = 5242880, 'bucket product-images limité à 5 Mo côté serveur';
  assert (select file_size_limit from storage.buckets where id='avatars') = 5242880, 'bucket avatars limité à 5 Mo côté serveur';
  assert (select allowed_mime_types from storage.buckets where id='product-images') = array['image/jpeg','image/png','image/webp'], 'MIME autorisés côté serveur (product-images)';
  assert (select allowed_mime_types from storage.buckets where id='avatars') = array['image/jpeg','image/png','image/webp'], 'MIME autorisés côté serveur (avatars)';
  assert pg_temp.run_as('authenticated','b3000000-0000-0000-0000-000000000001','insert into storage.objects(bucket_id,name,owner) values (''product-images'',''b3000000-0000-0000-0000-000000000001/a.jpg'',''b3000000-0000-0000-0000-000000000001'')') = 'ok:1', 'upload dans son propre dossier autorisé';
  assert pg_temp.denied(pg_temp.run_as('authenticated','b3000000-0000-0000-0000-000000000002','insert into storage.objects(bucket_id,name,owner) values (''product-images'',''b3000000-0000-0000-0000-000000000001/pirate.jpg'',''b3000000-0000-0000-0000-000000000002'')')), 'upload dans le dossier d''un autre refusé (product-images)';
  assert pg_temp.denied(pg_temp.run_as('authenticated','b3000000-0000-0000-0000-000000000002','insert into storage.objects(bucket_id,name,owner) values (''avatars'',''b3000000-0000-0000-0000-000000000001/pirate.jpg'',''b3000000-0000-0000-0000-000000000002'')')), 'upload dans le dossier d''un autre refusé (avatars)';
  assert pg_temp.denied(pg_temp.run_as('authenticated','b3000000-0000-0000-0000-000000000002','delete from storage.objects where name=''b3000000-0000-0000-0000-000000000001/a.jpg''')), 'suppression du fichier d''un autre refusée';
  assert pg_temp.denied(pg_temp.run_as('authenticated','b3000000-0000-0000-0000-000000000002','update storage.objects set name=''b3000000-0000-0000-0000-000000000002/vole.jpg'' where name=''b3000000-0000-0000-0000-000000000001/a.jpg''')), 'renommage du fichier d''un autre refusé';
  assert pg_temp.denied(pg_temp.run_as('anon', null, 'insert into storage.objects(bucket_id,name,owner) values (''avatars'',''anon/x.jpg'',null)')), 'anon ne téléverse pas';
  assert pg_temp.run_as('authenticated','b3000000-0000-0000-0000-000000000001','delete from storage.objects where name=''b3000000-0000-0000-0000-000000000001/a.jpg''') = 'ok:1', 'suppression de son propre fichier autorisée';
end $$;
select 'storage : OK' as test;

-- ===================================================== messages
do $$ begin
  insert into messages(sender_id,receiver_id,content) values ('b3000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','bonjour');
  assert pg_temp.run_as('authenticated','b3000000-0000-0000-0000-000000000002','select 1 from messages') = 'ok:0', 'un tiers ne lit pas les messages d''autrui';
  assert pg_temp.denied(pg_temp.run_as('authenticated','b3000000-0000-0000-0000-000000000002','insert into messages(sender_id,receiver_id,content) values (''b3000000-0000-0000-0000-000000000001'',''a3000000-0000-0000-0000-000000000001'',''usurpation'')')), 'on n''envoie pas un message au nom d''un autre';
end $$;
select 'messages : OK' as test;
select 'SÉCURITÉ / RLS : TOUTES LES ASSERTIONS PASSENT' as resultat;
