-- Parcours complet producteur → acheteur → livraison au niveau base de données.
-- Voir supabase/tests/README.md pour l'exécution (PostgreSQL local, sans Supabase).
\set ON_ERROR_STOP off
\set QUIET on
-- utilisateurs
insert into auth.users(id,email,raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','prod@test.cd','{"role":"producer","full_name":"Producteur Test","province":"Kinshasa","city":"Kinshasa"}'),
 ('22222222-2222-2222-2222-222222222222','resto@test.cd','{"role":"buyer","buyer_type":"restaurant","full_name":"Restaurant Test"}'),
 ('33333333-3333-3333-3333-333333333333','admin@test.cd','{"role":"buyer","full_name":"Autre acheteur"}');
select 'profils créés' as etape, count(*) from profiles;

-- PRODUCTEUR publie
set role authenticated; set request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
insert into products(user_id,name,category,quantity,unit,price,currency,province,city,status)
 values ('11111111-1111-1111-1111-111111111111','Maïs','cereals',500,'kg',0.5,'USD','Kinshasa','Kinshasa','available') returning id \gset prod_
select 'producteur publie maïs' as etape, name, quantity, status from products;
-- PRODUCTEUR modifie (Modifier)
update products set quantity=600, price=0.55 where id=:'prod_id' and user_id='11111111-1111-1111-1111-111111111111';
select 'producteur modifie' as etape, quantity, price from products;
reset role;

-- ACHETEUR ne peut pas publier une offre (nouvelle policy)
set role authenticated; set request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
do $$ begin
  begin
    insert into products(user_id,name,category,quantity,unit,price) values ('22222222-2222-2222-2222-222222222222','Faux','cereals',1,'kg',1);
    raise exception 'ÉCHEC : un acheteur a pu publier une offre';
  exception when insufficient_privilege then null;  -- attendu : la policy RLS refuse
  end;
end $$;
select 'acheteur voit offres disponibles' as etape, count(*) from products where status='available';
insert into buyer_requests(user_id,product_name,quantity,unit,city,status) values ('22222222-2222-2222-2222-222222222222','Maïs',500,'kg','Kinshasa','open');
select 'demande acheteur' as etape, product_name, quantity from buyer_requests;

-- (config admin) Mobile Money est désactivé par défaut depuis la passe 16 : on l'active pour ce test
reset role;
update payment_settings set enabled_methods='["cash_on_delivery","mobile_money"]'::jsonb, method_currencies='{"mobile_money":["USD"],"card":[],"cash_on_delivery":["USD"]}'::jsonb;
set role authenticated; set request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
-- commande depuis le panier (paiement Mobile Money réel — CinetPay)
select create_order_from_cart('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  jsonb_build_array(jsonb_build_object('product_id',:'prod_id','quantity',500)),
  '{"recipient_name":"Resto Test","recipient_phone":"+243812345678","address":"Av. du Commerce 12","city":"Kinshasa","commune":"Gombe","instructions":""}'::jsonb,
  'mobile_money', 275) as commande \gset
select :'commande'::jsonb ->> 'ok' as ok, :'commande'::jsonb #>> '{orders,0,status}' as statut, :'commande'::jsonb #>> '{orders,0,payment_status}' as paiement;
select :'commande'::jsonb #>> '{orders,0,id}' as oid \gset o_
select 'stock après commande' as etape, quantity, status from products;
-- rejeu idempotent
select (create_order_from_cart('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, jsonb_build_array(jsonb_build_object('product_id',:'prod_id','quantity',500)),'{"recipient_name":"Resto Test","recipient_phone":"+243812345678","address":"Av. du Commerce 12","city":"Kinshasa","commune":"Gombe","instructions":""}'::jsonb,'mobile_money',275)) ->> 'replayed' as rejeu;
reset role;

-- ACHETEUR : ouvre une tentative de paiement (Edge Function payment-initiate, simulée ici par la RPC)
set role authenticated; set request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
select payment_initiate_begin(:'o_oid'::uuid,'mobile_money','test-idem-key-0001', '+243812345678') ->> 'internal_reference' as ref \gset p_
select 'paiement ouvert' as etape, status, checkout_url is null as pas_encore_attache from payments where order_id=:'o_oid'::uuid;
reset role;

-- SERVICE_ROLE : le prestataire répond à /v2/payment (Edge Function payment-initiate)
set request.jwt.claim.role='service_role'; set request.jwt.claim.sub='';
select payment_provider_attach(
  (select id from payments where order_id=:'o_oid'::uuid),
  'CINETPAY-TOKEN-TEST', 'https://checkout.cinetpay.com/payment/test', '{}'::jsonb
) ->> 'ok' as attache;
select 'après attach' as etape, status, checkout_url from payments where order_id=:'o_oid'::uuid;

-- SERVICE_ROLE : webhook CinetPay vérifié (HMAC + /v2/payment/check simulés) — paiement accepté
select payment_apply_result(
  :'p_ref', 'CINETPAY-TOKEN-TEST', 'ACCEPTED', 275, 'USD', 'OM', '+243812345678',
  'webhook', 'OPERATOR-EVT-0001', '{"simulated":true}'::jsonb
) as resultat_webhook;
select 'après webhook' as etape, status, payment_status from orders where id=:'o_oid'::uuid;
-- rejeu du même événement webhook (idempotence)
select payment_apply_result(
  :'p_ref', 'CINETPAY-TOKEN-TEST', 'ACCEPTED', 275, 'USD', 'OM', '+243812345678',
  'webhook', 'OPERATOR-EVT-0001', '{"simulated":true,"retry":true}'::jsonb
) ->> 'duplicate' as webhook_rejoue;
reset role;

-- PRODUCTEUR : (Passe 23) le paiement ne confirme plus la commande : elle reste `pending`
-- avec une échéance ; le producteur CONFIRME lui-même -> prépare -> prête -> en livraison -> livrée
set role authenticated; set request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select 'producteur voit la commande' as etape, count(*) from orders where producer_id=auth.uid();
select 'statut après paiement confirmé' as etape, status, payment_status, confirmation_deadline is not null as echeance from orders where id=:'o_oid'::uuid;
select transition_order_status(:'o_oid'::uuid,'confirmed','Confirmée par le producteur') ->> 'ok' as confirmed;
select transition_order_status(:'o_oid'::uuid,'preparing','ok') ->> 'ok' as preparing;
select transition_order_status(:'o_oid'::uuid,'ready','ok') ->> 'ok' as ready;
select transition_order_status(:'o_oid'::uuid,'in_delivery','ok') ->> 'ok' as in_delivery;
select transition_order_status(:'o_oid'::uuid,'delivered','ok') ->> 'ok' as delivered;
reset role;

-- ACHETEUR : confirme réception
set role authenticated; set request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
select transition_order_status(:'o_oid'::uuid,'completed','Réception confirmée') ->> 'ok' as completed;
select 'commande finale' as etape, status, payment_status, payment_method from orders;
select 'livraison' as etape, status from deliveries;
select 'historique' as etape, string_agg(status, ' > ' order by created_at) from order_status_history;
reset role;
-- un tiers ne voit rien
set role authenticated; set request.jwt.claim.sub='33333333-3333-3333-3333-333333333333';
select 'tiers voit commandes' as etape, count(*) from orders;
select transition_order_status(:'o_oid'::uuid,'cancelled','x') ->> 'code' as tiers_refuse;
reset role;
select 'notifications' as etape, count(*) from notifications;
do $$ begin
  assert (select count(*) from orders) = 1, 'une seule commande dans le scénario';
  assert (select status from orders) = 'completed', 'cycle complet : la commande est terminée';
  assert (select payment_status from orders) = 'paid', 'le paiement est encaissé';
  assert (select status from deliveries) = 'delivered', 'la livraison est livrée';
end $$;
select 'CYCLE COMPLET : OK' as resultat;
