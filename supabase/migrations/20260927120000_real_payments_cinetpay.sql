/*
# AgriFlow RDC — Paiement réel (CinetPay) : passe production (Passe 16)

## Contexte
Jusqu'ici, `create_order_from_cart` marquait tout paiement Mobile Money / carte
comme `demo_paid` immédiatement, sans prestataire réel connecté (`payments.is_demo`).
Cette migration retire ce chemin de démonstration et met en place l'architecture
réelle : le frontend ne décide jamais qu'un paiement est réussi ; seul un webhook
CinetPay vérifié côté serveur (Edge Function `payment-webhook`, relayée par les RPC
ci-dessous) peut faire passer un paiement à `paid`.

## Ce que fait cette migration
1. Étend `payments` : référence interne, référence prestataire, statut prestataire,
   URL de paiement hébergée, motif d'échec, horodatages par statut, opérateur /
   numéro utilisés, clé d'idempotence, métadonnées.
2. Étend `orders` : commission plateforme, montant net producteur, statut de
   règlement (séparé du paiement et de la livraison).
3. Ajoute `payment_events` (journal d'événements, idempotent par événement
   prestataire), `payment_settings` (configuration admin : moyens activés,
   devises par moyen, commission, environnement CinetPay) et `refunds`
   (remboursements, gérés manuellement tant qu'aucune API de remboursement
   CinetPay n'est branchée).
4. Remplace `apply_provider_payment_event` (jamais appelée en production) par un
   jeu de RPC dédiées à CinetPay :
   - `payment_initiate_begin` (authenticated) : ouvre/reprend une tentative de
     paiement de façon idempotente (aucun secret, aucun montant fourni par le
     client — tout est relu depuis `orders`).
   - `payment_provider_attach` (service_role) : enregistre la réponse
     d'initialisation CinetPay (payment_token / payment_url).
   - `payment_apply_result` (service_role) : point d'entrée UNIQUE pour le
     webhook et pour la vérification active — idempotent, vérifie montant et
     devise avant de confirmer, ne régresse jamais un paiement déjà `paid`.
   - `request_refund` / `admin_process_refund` : cycle de remboursement manuel.
   - `admin_update_payment_settings` : configuration des moyens de paiement.
5. RLS : `payments`/`orders` restent en écriture RPC-only (inchangé). Les
   nouvelles tables sont verrouillées de la même façon (lecture participant /
   admin, écriture uniquement via fonctions SECURITY DEFINER).

Aucun DROP destructif. `payment_status`/`payments.status` conservent la valeur
historique `demo_paid` dans leurs contraintes CHECK pour ne pas casser les
anciennes commandes de démonstration déjà en base — mais plus aucune écriture
future ne produit cette valeur.
*/

-- ============================================================
-- 0. UTILITAIRE : référence lisible et unique
-- ============================================================
CREATE OR REPLACE FUNCTION _generate_reference(p_prefix text)
RETURNS text
LANGUAGE sql
VOLATILE
AS $$
  SELECT p_prefix || '-' || to_char(now(), 'YYYYMMDD') || '-' ||
         upper(substr(encode(gen_random_bytes(5), 'hex'), 1, 8));
$$;
REVOKE ALL ON FUNCTION _generate_reference(text) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 1. PAYMENTS : colonnes réelles de paiement
-- ============================================================
ALTER TABLE payments ADD COLUMN IF NOT EXISTS internal_reference text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_transaction_id text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_status text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS checkout_url text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS failure_reason text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS phone_number text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS operator text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS failed_at timestamptz;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

-- Reprise : migre l'ancienne provider_reference (démo) vers provider_transaction_id
-- et donne une référence interne à tout paiement qui n'en a pas encore.
UPDATE payments SET provider_transaction_id = provider_reference
WHERE provider_transaction_id IS NULL AND provider_reference IS NOT NULL;

UPDATE payments SET internal_reference = 'AGF-PAY-' || to_char(created_at, 'YYYYMMDD') || '-' || upper(substr(id::text, 1, 8))
WHERE internal_reference IS NULL;

ALTER TABLE payments ALTER COLUMN internal_reference SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_internal_reference ON payments(internal_reference);
CREATE INDEX IF NOT EXISTS idx_payments_provider_transaction ON payments(provider_transaction_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- Statuts réels (on garde 'demo_paid' dans la contrainte pour l'historique déjà en
-- base, mais plus aucune écriture ne le produit désormais).
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE payments ADD CONSTRAINT payments_status_check
  CHECK (status IN ('pending', 'processing', 'paid', 'failed', 'cancelled', 'expired', 'refunded', 'demo_paid'));

-- ============================================================
-- 2. ORDERS : statuts de paiement + champs de règlement marketplace
-- ============================================================
SELECT _drop_check_constraints('orders'::regclass, 'payment_status');
ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('pending', 'processing', 'paid', 'failed', 'cancelled', 'expired', 'refunded', 'demo_paid'));

ALTER TABLE orders ADD COLUMN IF NOT EXISTS platform_fee numeric NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS seller_amount numeric;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS settlement_status text NOT NULL DEFAULT 'pending';

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_settlement_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_settlement_status_check
  CHECK (settlement_status IN ('pending', 'on_hold', 'settled'));

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_platform_fee_check;
ALTER TABLE orders ADD CONSTRAINT orders_platform_fee_check
  CHECK (platform_fee >= 0 AND (seller_amount IS NULL OR seller_amount >= 0)) NOT VALID;

-- ============================================================
-- 3. PAYMENT_SETTINGS (configuration admin — un seul enregistrement)
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  commission_type text NOT NULL DEFAULT 'percentage' CHECK (commission_type IN ('percentage', 'fixed')),
  commission_value numeric NOT NULL DEFAULT 5,
  enabled_methods jsonb NOT NULL DEFAULT '["cash_on_delivery"]'::jsonb,
  method_currencies jsonb NOT NULL DEFAULT '{"mobile_money": ["CDF"], "card": [], "cash_on_delivery": ["CDF", "USD"]}'::jsonb,
  cinetpay_environment text NOT NULL DEFAULT 'sandbox' CHECK (cinetpay_environment IN ('sandbox', 'production')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO payment_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE payment_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payment_settings_admin_all" ON payment_settings;
CREATE POLICY "payment_settings_admin_all" ON payment_settings FOR ALL
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
-- Pas de policy pour anon/authenticated non-admin : la lecture publique passe
-- par la fonction get_payment_methods() ci-dessous (ne fuit pas la commission).

DROP TRIGGER IF EXISTS trg_payment_settings_updated ON payment_settings;
CREATE TRIGGER trg_payment_settings_updated BEFORE UPDATE ON payment_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 4. PAYMENT_EVENTS (journal, idempotence webhook)
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('initiated', 'webhook', 'verify', 'refund')),
  provider text NOT NULL DEFAULT 'cinetpay',
  provider_event_id text,
  provider_status text,
  amount numeric,
  currency text,
  processed boolean NOT NULL DEFAULT false,
  result_code text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Un même événement prestataire (transaction_id + statut) n'est traité qu'une fois.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_events_provider_event
  ON payment_events(payment_id, event_type, provider_event_id, provider_status)
  WHERE provider_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_events_payment ON payment_events(payment_id);

ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payment_events_admin_read" ON payment_events;
CREATE POLICY "payment_events_admin_read" ON payment_events FOR SELECT
  TO authenticated USING (is_admin());
-- Aucune policy d'écriture : seules les fonctions SECURITY DEFINER (propriétaire) écrivent.

-- ============================================================
-- 5. REFUNDS (remboursement — cycle manuel tant qu'aucune API n'est branchée)
-- ============================================================
CREATE TABLE IF NOT EXISTS refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  currency text NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'processing', 'completed', 'failed')),
  provider_reference text,
  processed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "refunds_participant_read" ON refunds;
CREATE POLICY "refunds_participant_read" ON refunds FOR SELECT
  TO authenticated USING (
    requested_by = auth.uid()
    OR EXISTS (SELECT 1 FROM orders WHERE orders.id = refunds.order_id AND (orders.buyer_id = auth.uid() OR orders.producer_id = auth.uid()))
    OR is_admin()
  );
DROP POLICY IF EXISTS "refunds_admin_all" ON refunds;
CREATE POLICY "refunds_admin_all" ON refunds FOR ALL
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP TRIGGER IF EXISTS trg_refunds_updated ON refunds;
CREATE TRIGGER trg_refunds_updated BEFORE UPDATE ON refunds
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 6. PROTECTION DES CHAMPS FINANCIERS (étendue aux nouvelles colonnes)
-- ============================================================
CREATE OR REPLACE FUNCTION protect_order_financial_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF is_admin() OR current_setting('app.order_rpc', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.total_amount IS DISTINCT FROM OLD.total_amount
     OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
     OR NEW.delivery_fee IS DISTINCT FROM OLD.delivery_fee
     OR NEW.platform_fee IS DISTINCT FROM OLD.platform_fee
     OR NEW.seller_amount IS DISTINCT FROM OLD.seller_amount
     OR NEW.settlement_status IS DISTINCT FROM OLD.settlement_status THEN
    RAISE EXCEPTION 'Modification du montant de la commande non autorisée';
  END IF;
  IF NEW.currency IS DISTINCT FROM OLD.currency THEN
    RAISE EXCEPTION 'Modification de la devise de la commande non autorisée';
  END IF;
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status
     OR NEW.payment_method IS DISTINCT FROM OLD.payment_method THEN
    RAISE EXCEPTION 'Modification du paiement non autorisée';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 7. create_order_from_cart : retrait du chemin « démonstration »
-- ============================================================
-- Un paiement Mobile Money / carte est désormais créé au statut `pending`,
-- SANS aucune référence prestataire : l'initiation réelle se fait ensuite via
-- l'Edge Function payment-initiate → RPC payment_initiate_begin.
CREATE OR REPLACE FUNCTION create_order_from_cart(
  p_checkout_id uuid,
  p_items jsonb,
  p_delivery jsonb,
  p_payment_method text,
  p_expected_total numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_elem jsonb;
  v_req jsonb;
  v_ids uuid[];
  v_issues jsonb;
  v_errors jsonb := '{}'::jsonb;
  v_name text;
  v_phone text;
  v_digits text;
  v_address text;
  v_city text;
  v_commune text;
  v_instructions text;
  v_currency_count integer;
  v_currency text;
  v_grand_total numeric;
  v_group record;
  v_first record;
  v_order_id uuid;
  v_order_number text;
  v_delivery_fee numeric;
  v_total numeric;
  v_pay_status text;
  v_first_name text;
  v_body text;
  v_payment_ref text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN _order_error('NOT_AUTHENTICATED');
  END IF;

  -- ---- Validation de la requête (aucune écriture avant la fin de cette section)
  IF p_checkout_id IS NULL THEN
    RETURN _order_error('INVALID_REQUEST');
  END IF;
  IF p_payment_method IS NULL OR p_payment_method NOT IN ('mobile_money', 'card', 'cash_on_delivery') THEN
    RETURN _order_error('INVALID_PAYMENT_METHOD');
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN _order_error('EMPTY_CART');
  END IF;
  IF jsonb_array_length(p_items) > 50 THEN
    RETURN _order_error('CART_TOO_LARGE');
  END IF;

  FOR v_elem IN SELECT e FROM jsonb_array_elements(p_items) AS e LOOP
    IF jsonb_typeof(v_elem) <> 'object' THEN
      RETURN _order_error('INVALID_ITEMS');
    END IF;
    IF COALESCE(v_elem ->> 'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RETURN _order_error('INVALID_ITEMS');
    END IF;
    IF COALESCE(v_elem ->> 'quantity', '') !~ '^[0-9]{1,9}(\.[0-9]{1,3})?$' THEN
      RETURN _order_error('INVALID_ITEMS');
    END IF;
    IF (v_elem ->> 'quantity')::numeric <= 0 THEN
      RETURN _order_error('INVALID_ITEMS');
    END IF;
  END LOOP;

  IF p_delivery IS NULL OR jsonb_typeof(p_delivery) <> 'object' THEN
    RETURN _order_error('INVALID_DELIVERY', jsonb_build_object('fields', jsonb_build_object('address', 'Indiquez l''adresse de livraison.')));
  END IF;

  v_name := btrim(COALESCE(p_delivery ->> 'recipient_name', ''));
  v_phone := btrim(COALESCE(p_delivery ->> 'recipient_phone', ''));
  v_address := btrim(COALESCE(p_delivery ->> 'address', ''));
  v_city := btrim(COALESCE(p_delivery ->> 'city', ''));
  v_commune := NULLIF(btrim(COALESCE(p_delivery ->> 'commune', '')), '');
  v_instructions := NULLIF(btrim(COALESCE(p_delivery ->> 'instructions', '')), '');

  IF char_length(v_name) < 2 OR char_length(v_name) > 120 THEN
    v_errors := v_errors || jsonb_build_object('recipient_name', 'Indiquez le nom du destinataire.');
  END IF;
  v_digits := regexp_replace(v_phone, '\D', '', 'g');
  IF v_phone !~ '^\+?[0-9][0-9 ().-]*$' OR char_length(v_digits) NOT BETWEEN 9 AND 15 THEN
    v_errors := v_errors || jsonb_build_object('recipient_phone', 'Indiquez un numéro de téléphone valide.');
  END IF;
  IF char_length(v_address) < 3 OR char_length(v_address) > 300 THEN
    v_errors := v_errors || jsonb_build_object('address', 'Indiquez l''adresse de livraison.');
  END IF;
  IF char_length(v_city) < 2 OR char_length(v_city) > 100 THEN
    v_errors := v_errors || jsonb_build_object('city', 'Indiquez la ville de livraison.');
  END IF;
  IF v_commune IS NOT NULL AND char_length(v_commune) > 100 THEN
    v_errors := v_errors || jsonb_build_object('commune', 'La commune est trop longue.');
  END IF;
  IF v_instructions IS NOT NULL AND char_length(v_instructions) > 500 THEN
    v_errors := v_errors || jsonb_build_object('instructions', 'Les instructions sont trop longues (500 caractères maximum).');
  END IF;
  IF v_errors <> '{}'::jsonb THEN
    RETURN _order_error('INVALID_DELIVERY', jsonb_build_object('fields', v_errors));
  END IF;

  -- ---- Idempotence : un même checkout_id ne crée jamais deux fois les commandes.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_checkout_id::text, 0));

  IF EXISTS (SELECT 1 FROM orders WHERE buyer_id = v_uid AND checkout_id = p_checkout_id) THEN
    RETURN _checkout_result(v_uid, p_checkout_id, true);
  END IF;

  -- ---- Regroupe les doublons de produits puis verrouille les produits (ordre stable)
  SELECT jsonb_agg(jsonb_build_object('product_id', t.product_id, 'quantity', t.qty)),
         array_agg(t.product_id)
  INTO v_req, v_ids
  FROM (
    SELECT (e ->> 'product_id')::uuid AS product_id, sum((e ->> 'quantity')::numeric) AS qty
    FROM jsonb_array_elements(p_items) AS e
    GROUP BY 1
  ) t;

  PERFORM 1 FROM products WHERE id = ANY (v_ids) ORDER BY id FOR UPDATE;

  -- ---- Revalidation serveur : existence, statut, stock, prix, propriétaire
  SELECT jsonb_agg(jsonb_build_object(
    'product_id', r.product_id,
    'name', p.name,
    'reason', CASE
      WHEN p.id IS NULL THEN 'removed'
      WHEN p.user_id = v_uid THEN 'own_product'
      WHEN p.status <> 'available' THEN 'unavailable'
      WHEN p.price <= 0 THEN 'price_missing'
      ELSE 'insufficient_stock' END,
    'available', COALESCE(GREATEST(p.quantity, 0), 0),
    'requested', r.quantity
  ))
  INTO v_issues
  FROM jsonb_to_recordset(v_req) AS r(product_id uuid, quantity numeric)
  LEFT JOIN products p ON p.id = r.product_id
  WHERE p.id IS NULL
     OR p.user_id = v_uid
     OR p.status <> 'available'
     OR p.price <= 0
     OR p.quantity < r.quantity;

  IF v_issues IS NOT NULL THEN
    RETURN _order_error('CART_INVALID', jsonb_build_object('issues', v_issues));
  END IF;

  SELECT count(DISTINCT currency), min(currency) INTO v_currency_count, v_currency
  FROM products WHERE id = ANY (v_ids);
  IF v_currency_count > 1 THEN
    RETURN _order_error('MIXED_CURRENCY');
  END IF;

  -- ---- Total recalculé depuis les prix ACTUELS de la base
  SELECT COALESCE(sum(round(p.price * r.quantity, 2)), 0) INTO v_grand_total
  FROM jsonb_to_recordset(v_req) AS r(product_id uuid, quantity numeric)
  JOIN products p ON p.id = r.product_id;

  IF p_expected_total IS NOT NULL AND round(p_expected_total, 2) <> round(v_grand_total, 2) THEN
    RETURN _order_error('PRICE_CHANGED', jsonb_build_object('server_total', v_grand_total, 'currency', v_currency));
  END IF;

  -- ---- Écritures (transaction unique : tout ou rien)
  PERFORM set_config('app.order_rpc', 'on', true);

  -- Tout paiement démarre à `pending` : plus aucun paiement n'est déclaré réussi à
  -- la création de la commande (voir 51.1 supprime le chemin démo).
  v_pay_status := 'pending';

  FOR v_group IN
    SELECT p.user_id AS producer_id,
           count(*) AS n_items,
           sum(round(p.price * r.quantity, 2)) AS subtotal
    FROM jsonb_to_recordset(v_req) AS r(product_id uuid, quantity numeric)
    JOIN products p ON p.id = r.product_id
    GROUP BY p.user_id
    ORDER BY p.user_id
  LOOP
    v_delivery_fee := 0;
    v_total := v_group.subtotal + v_delivery_fee;

    SELECT p.id AS product_id, p.unit AS unit, r.quantity AS quantity
    INTO v_first
    FROM jsonb_to_recordset(v_req) AS r(product_id uuid, quantity numeric)
    JOIN products p ON p.id = r.product_id
    WHERE p.user_id = v_group.producer_id
    ORDER BY p.id
    LIMIT 1;

    INSERT INTO orders (
      buyer_id, product_id, producer_id, quantity, unit,
      subtotal, delivery_fee, total_amount, currency,
      status, payment_method, payment_status,
      delivery_address, delivery_city, notes, checkout_id
    ) VALUES (
      v_uid,
      CASE WHEN v_group.n_items = 1 THEN v_first.product_id ELSE NULL END,
      v_group.producer_id,
      CASE WHEN v_group.n_items = 1 THEN v_first.quantity ELSE NULL END,
      CASE WHEN v_group.n_items = 1 THEN v_first.unit ELSE 'kg' END,
      v_group.subtotal, v_delivery_fee, v_total, v_currency,
      'pending', p_payment_method, v_pay_status,
      v_address, v_city, v_instructions, p_checkout_id
    )
    RETURNING id, order_number INTO v_order_id, v_order_number;

    INSERT INTO order_items (order_id, product_id, producer_id, product_name, product_image, unit, unit_price, quantity, subtotal, currency)
    SELECT v_order_id, p.id, p.user_id, p.name, p.images[1], p.unit, p.price, r.quantity,
           round(p.price * r.quantity, 2), p.currency
    FROM jsonb_to_recordset(v_req) AS r(product_id uuid, quantity numeric)
    JOIN products p ON p.id = r.product_id
    WHERE p.user_id = v_group.producer_id;

    INSERT INTO deliveries (order_id, status, recipient_name, recipient_phone, address, city, commune, notes)
    VALUES (v_order_id, 'pending', v_name, v_phone, v_address, v_city, v_commune, v_instructions);

    v_payment_ref := _generate_reference('AGF-PAY');
    INSERT INTO payments (order_id, user_id, amount, currency, method, status, provider, internal_reference)
    VALUES (
      v_order_id, v_uid, v_total, v_currency, p_payment_method, v_pay_status,
      CASE WHEN p_payment_method = 'cash_on_delivery' THEN 'cash' ELSE 'cinetpay' END,
      v_payment_ref
    );

    INSERT INTO order_status_history (order_id, status, changed_by, note)
    VALUES (v_order_id, 'pending', v_uid, 'Commande créée par l''acheteur');

    SELECT product_name INTO v_first_name FROM order_items WHERE order_id = v_order_id ORDER BY product_name LIMIT 1;
    v_body := v_order_number || ' — ' || v_first_name
      || CASE WHEN v_group.n_items > 1 THEN ' et ' || (v_group.n_items - 1)::text || ' autre(s) produit(s)' ELSE '' END
      || ' — ' || trim_scale(v_total)::text || ' ' || v_currency
      || CASE WHEN p_payment_method = 'cash_on_delivery' THEN ' (paiement à la livraison)' ELSE ' (en attente de paiement)' END;

    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (v_group.producer_id, 'new_order', 'Nouvelle commande reçue', v_body, '/orders/' || v_order_id::text);
  END LOOP;

  -- Décrément du stock (les lignes sont verrouillées et déjà validées)
  UPDATE products p
  SET quantity = p.quantity - r.quantity,
      status = CASE WHEN p.quantity - r.quantity <= 0 THEN 'sold_out' ELSE p.status END
  FROM jsonb_to_recordset(v_req) AS r(product_id uuid, quantity numeric)
  WHERE p.id = r.product_id;

  RETURN _checkout_result(v_uid, p_checkout_id, false);
END;
$$;

-- ============================================================
-- 8. transition_order_status : n'exige plus « demo_paid »
-- ============================================================
CREATE OR REPLACE FUNCTION transition_order_status(
  p_order_id uuid,
  p_new_status text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order orders%ROWTYPE;
  v_role text;
  v_recipients uuid[];
  v_title text;
  v_delivery_status text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN _order_error('NOT_AUTHENTICATED');
  END IF;
  IF p_new_status IS NULL OR p_new_status NOT IN ('pending', 'confirmed', 'preparing', 'ready', 'in_delivery', 'delivered', 'completed', 'cancelled') THEN
    RETURN _order_error('INVALID_STATUS');
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN _order_error('ORDER_NOT_FOUND');
  END IF;

  IF v_uid = v_order.producer_id THEN
    v_role := 'producer';
  ELSIF v_uid = v_order.buyer_id THEN
    v_role := 'buyer';
  ELSIF is_admin() THEN
    v_role := 'admin';
  ELSE
    RETURN _order_error('ORDER_NOT_FOUND');
  END IF;

  IF NOT order_transition_allowed(v_role, v_order.status, p_new_status) THEN
    RETURN _order_error('INVALID_TRANSITION', jsonb_build_object('from', v_order.status, 'to', p_new_status));
  END IF;

  -- Un paiement Mobile Money / carte doit être réellement réglé (webhook CinetPay
  -- confirmé) avant que le producteur ne confirme la commande.
  IF p_new_status = 'confirmed'
     AND v_order.payment_method IN ('mobile_money', 'card')
     AND v_order.payment_status <> 'paid' THEN
    RETURN _order_error('PAYMENT_REQUIRED');
  END IF;

  PERFORM set_config('app.order_rpc', 'on', true);

  UPDATE orders SET status = p_new_status WHERE id = p_order_id;

  v_delivery_status := CASE p_new_status
    WHEN 'pending' THEN 'pending'
    WHEN 'confirmed' THEN 'pending'
    WHEN 'preparing' THEN 'preparing'
    WHEN 'ready' THEN 'ready'
    WHEN 'in_delivery' THEN 'in_delivery'
    WHEN 'delivered' THEN 'delivered'
    WHEN 'completed' THEN 'delivered'
    ELSE 'cancelled' END;

  UPDATE deliveries
  SET status = v_delivery_status,
      delivered_at = CASE WHEN v_delivery_status = 'delivered' THEN COALESCE(delivered_at, now()) ELSE delivered_at END
  WHERE order_id = p_order_id;

  IF p_new_status = 'cancelled' THEN
    -- Le stock réservé à la création est restitué (le produit peut avoir été supprimé : product_id NULL).
    UPDATE products p
    SET quantity = p.quantity + i.quantity,
        status = CASE WHEN p.status = 'sold_out' THEN 'available' ELSE p.status END
    FROM order_items i
    WHERE i.order_id = p_order_id AND i.product_id = p.id;

    -- Un paiement réellement encaissé (Mobile Money/carte payé, ou espèces déjà
    -- confirmé) n'est JAMAIS marqué remboursé automatiquement ici : un vrai
    -- remboursement doit passer par request_refund / admin_process_refund.
    IF v_order.payment_status NOT IN ('paid', 'refunded') THEN
      UPDATE payments SET status = 'cancelled', cancelled_at = now()
      WHERE order_id = p_order_id AND status IN ('pending', 'processing');
      UPDATE orders SET payment_status = 'cancelled' WHERE id = p_order_id AND payment_status IN ('pending', 'processing');
    END IF;
  END IF;

  INSERT INTO order_status_history (order_id, status, changed_by, note)
  VALUES (p_order_id, p_new_status, v_uid, NULLIF(btrim(COALESCE(p_note, '')), ''));

  v_title := CASE p_new_status
    WHEN 'confirmed' THEN 'Commande confirmée'
    WHEN 'preparing' THEN 'Commande en préparation'
    WHEN 'ready' THEN 'Commande prête'
    WHEN 'in_delivery' THEN 'Commande en livraison'
    WHEN 'delivered' THEN 'Commande livrée'
    WHEN 'completed' THEN 'Commande terminée'
    WHEN 'cancelled' THEN 'Commande annulée'
    ELSE 'Commande mise à jour' END;

  v_recipients := CASE v_role
    WHEN 'buyer' THEN ARRAY[v_order.producer_id]
    WHEN 'producer' THEN ARRAY[v_order.buyer_id]
    ELSE ARRAY[v_order.buyer_id, v_order.producer_id] END;

  INSERT INTO notifications (user_id, type, title, body, link)
  SELECT u, 'order_' || p_new_status, v_title, 'Commande ' || v_order.order_number, '/orders/' || p_order_id::text
  FROM unnest(v_recipients) AS u;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  RETURN jsonb_build_object('ok', true, 'order', to_jsonb(v_order));
END;
$$;

-- ============================================================
-- 9. confirm_cash_payment : inchangé dans l'esprit, statuts alignés
-- ============================================================
CREATE OR REPLACE FUNCTION confirm_cash_payment(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order orders%ROWTYPE;
  v_settings payment_settings%ROWTYPE;
  v_fee numeric;
BEGIN
  IF v_uid IS NULL THEN
    RETURN _order_error('NOT_AUTHENTICATED');
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR (v_order.producer_id <> v_uid AND NOT is_admin()) THEN
    RETURN _order_error('ORDER_NOT_FOUND');
  END IF;
  IF v_order.payment_method IS DISTINCT FROM 'cash_on_delivery' OR v_order.payment_status <> 'pending' THEN
    RETURN _order_error('INVALID_PAYMENT_STATE');
  END IF;
  IF v_order.status NOT IN ('delivered', 'completed') THEN
    RETURN _order_error('ORDER_NOT_DELIVERED');
  END IF;

  SELECT * INTO v_settings FROM payment_settings LIMIT 1;
  v_fee := CASE WHEN v_settings.commission_type = 'percentage'
                THEN round(v_order.total_amount * v_settings.commission_value / 100, 2)
                ELSE LEAST(v_settings.commission_value, v_order.total_amount) END;

  PERFORM set_config('app.order_rpc', 'on', true);

  UPDATE orders SET payment_status = 'paid', platform_fee = v_fee, seller_amount = v_order.total_amount - v_fee
  WHERE id = p_order_id;
  UPDATE payments SET status = 'paid', paid_at = now()
  WHERE order_id = p_order_id AND method = 'cash_on_delivery' AND status = 'pending';

  INSERT INTO notifications (user_id, type, title, body, link)
  VALUES (v_order.buyer_id, 'payment_confirmed', 'Paiement confirmé',
          'Le producteur a confirmé la réception du paiement de la commande ' || v_order.order_number,
          '/orders/' || p_order_id::text);

  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  RETURN jsonb_build_object('ok', true, 'order', to_jsonb(v_order));
END;
$$;

-- ============================================================
-- 10. payment_initiate_begin (authenticated) — ouverture idempotente
-- ============================================================
CREATE OR REPLACE FUNCTION payment_initiate_begin(
  p_order_id uuid,
  p_payment_method text,
  p_idempotency_key text,
  p_phone_number text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order orders%ROWTYPE;
  v_payment payments%ROWTYPE;
  v_settings payment_settings%ROWTYPE;
  v_buyer record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN _order_error('NOT_AUTHENTICATED');
  END IF;
  IF p_payment_method NOT IN ('mobile_money', 'card') THEN
    RETURN _order_error('INVALID_PAYMENT_METHOD');
  END IF;
  IF p_idempotency_key IS NULL OR char_length(p_idempotency_key) < 8 THEN
    RETURN _order_error('INVALID_REQUEST');
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.buyer_id <> v_uid THEN
    RETURN _order_error('ORDER_NOT_FOUND');
  END IF;
  IF v_order.status = 'cancelled' THEN
    RETURN _order_error('ORDER_CANCELLED');
  END IF;
  IF v_order.payment_status = 'paid' THEN
    RETURN _order_error('ALREADY_PAID');
  END IF;

  SELECT * INTO v_settings FROM payment_settings LIMIT 1;
  IF v_settings IS NULL OR NOT (v_settings.enabled_methods ? p_payment_method) THEN
    RETURN _order_error('METHOD_UNAVAILABLE');
  END IF;
  IF NOT (COALESCE(v_settings.method_currencies -> p_payment_method, '[]'::jsonb) ? v_order.currency) THEN
    RETURN _order_error('CURRENCY_UNAVAILABLE', jsonb_build_object('currency', v_order.currency));
  END IF;

  -- Une commande a au plus une tentative de paiement « active » : on la
  -- retrouve (verrouillée) et on la réutilise plutôt que d'en recréer une —
  -- c'est ce qui garantit l'idempotence en cas de double clic / double appel.
  SELECT * INTO v_payment FROM payments
  WHERE order_id = p_order_id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN _order_error('PAYMENT_NOT_FOUND');
  END IF;

  IF v_payment.status = 'paid' THEN
    RETURN _order_error('ALREADY_PAID');
  END IF;

  -- Une tentative est déjà en cours avec une URL de paiement valide : on la
  -- renvoie telle quelle, on ne rappelle pas CinetPay une seconde fois.
  IF v_payment.status = 'processing' AND v_payment.checkout_url IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true, 'replayed', true, 'already_initiated', true,
      'payment_id', v_payment.id, 'internal_reference', v_payment.internal_reference,
      'checkout_url', v_payment.checkout_url
    );
  END IF;

  UPDATE payments SET
    method = p_payment_method,
    phone_number = COALESCE(p_phone_number, phone_number),
    idempotency_key = p_idempotency_key,
    status = 'pending',
    provider = 'cinetpay',
    provider_transaction_id = NULL,
    provider_status = NULL,
    checkout_url = NULL,
    failure_reason = NULL
  WHERE id = v_payment.id
  RETURNING * INTO v_payment;

  PERFORM set_config('app.order_rpc', 'on', true);
  UPDATE orders SET payment_method = p_payment_method WHERE id = p_order_id;
  IF v_order.payment_status IN ('failed', 'cancelled', 'expired') THEN
    UPDATE orders SET payment_status = 'pending' WHERE id = p_order_id;
  END IF;

  SELECT full_name, phone INTO v_buyer FROM profiles WHERE user_id = v_uid;

  RETURN jsonb_build_object(
    'ok', true, 'replayed', false, 'already_initiated', false,
    'payment_id', v_payment.id,
    'internal_reference', v_payment.internal_reference,
    'amount', v_order.total_amount,
    'currency', v_order.currency,
    'order_number', v_order.order_number,
    'buyer_name', COALESCE(v_buyer.full_name, 'Client AgriFlow'),
    'buyer_phone', COALESCE(p_phone_number, v_buyer.phone, ''),
    'buyer_email', (SELECT email FROM auth.users WHERE id = v_uid)
  );
END;
$$;

-- ============================================================
-- 11. payment_provider_attach (service_role) — après l'appel CinetPay /v2/payment
-- ============================================================
CREATE OR REPLACE FUNCTION payment_provider_attach(
  p_payment_id uuid,
  p_provider_transaction_id text,
  p_checkout_url text,
  p_raw jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment payments%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RETURN _order_error('FORBIDDEN');
  END IF;

  SELECT * INTO v_payment FROM payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN _order_error('PAYMENT_NOT_FOUND');
  END IF;

  UPDATE payments SET
    provider_transaction_id = p_provider_transaction_id,
    checkout_url = p_checkout_url,
    provider_status = 'INITIATED',
    status = 'processing'
  WHERE id = p_payment_id;

  PERFORM set_config('app.order_rpc', 'on', true);
  UPDATE orders SET payment_status = 'processing'
  WHERE id = v_payment.order_id AND payment_status IN ('pending');

  INSERT INTO payment_events (payment_id, event_type, provider, provider_event_id, provider_status, processed, raw)
  VALUES (p_payment_id, 'initiated', 'cinetpay', p_provider_transaction_id, 'INITIATED', true, p_raw);

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ============================================================
-- 12. payment_apply_result (service_role) — point d'entrée UNIQUE webhook + verify
-- ============================================================
-- p_source : 'webhook' ou 'verify' (journalisation uniquement).
-- p_provider_status : statut brut CinetPay ('ACCEPTED', 'REFUSED', 'CANCELLED',
--   'WAITING_FOR_CUSTOMER', ...) — voir docs.cinetpay.com/api/1.0/checkout/verification.
CREATE OR REPLACE FUNCTION payment_apply_result(
  p_internal_reference text,
  p_provider_transaction_id text,
  p_provider_status text,
  p_amount numeric,
  p_currency text,
  p_operator text,
  p_phone_number text,
  p_source text,
  p_provider_event_id text,
  p_raw jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment payments%ROWTYPE;
  v_order orders%ROWTYPE;
  v_settings payment_settings%ROWTYPE;
  v_new_status text;
  v_fee numeric;
  v_event_id text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RETURN _order_error('FORBIDDEN');
  END IF;
  IF p_source NOT IN ('webhook', 'verify') THEN
    RETURN _order_error('INVALID_REQUEST');
  END IF;

  SELECT * INTO v_payment FROM payments WHERE internal_reference = p_internal_reference FOR UPDATE;
  IF NOT FOUND THEN
    RETURN _order_error('PAYMENT_NOT_FOUND');
  END IF;
  SELECT * INTO v_order FROM orders WHERE id = v_payment.order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN _order_error('ORDER_NOT_FOUND');
  END IF;

  -- Idempotence : le même événement prestataire (même transaction, même statut)
  -- déjà journalisé n'est jamais réappliqué deux fois.
  v_event_id := COALESCE(p_provider_event_id, p_provider_transaction_id, 'no-event-id');
  IF EXISTS (
    SELECT 1 FROM payment_events
    WHERE payment_id = v_payment.id AND event_type = p_source
      AND provider_event_id = v_event_id AND provider_status = p_provider_status
  ) THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'status', v_payment.status);
  END IF;

  -- Un paiement déjà `paid` ne régresse JAMAIS (protection contre un webhook
  -- retardé/dupliqué qui arriverait après une vérification manuelle positive).
  IF v_payment.status = 'paid' THEN
    INSERT INTO payment_events (payment_id, event_type, provider, provider_event_id, provider_status, amount, currency, processed, result_code, raw)
    VALUES (v_payment.id, p_source, 'cinetpay', v_event_id, p_provider_status, p_amount, p_currency, true, 'ALREADY_PAID_NOOP', p_raw);
    RETURN jsonb_build_object('ok', true, 'status', 'paid', 'noop', true);
  END IF;

  -- Le montant et la devise DOIVENT correspondre à ce qui a été calculé côté
  -- serveur à la création de la commande. Sinon : on journalise, on ne confirme
  -- rien, le paiement reste `processing`/`pending` pour investigation.
  IF p_amount IS NOT NULL AND round(p_amount, 2) <> round(v_payment.amount, 2) THEN
    INSERT INTO payment_events (payment_id, event_type, provider, provider_event_id, provider_status, amount, currency, processed, result_code, raw)
    VALUES (v_payment.id, p_source, 'cinetpay', v_event_id, p_provider_status, p_amount, p_currency, false, 'AMOUNT_MISMATCH', p_raw);
    RETURN _order_error('AMOUNT_MISMATCH', jsonb_build_object('expected', v_payment.amount, 'received', p_amount));
  END IF;
  IF p_currency IS NOT NULL AND upper(p_currency) <> upper(v_payment.currency) THEN
    INSERT INTO payment_events (payment_id, event_type, provider, provider_event_id, provider_status, amount, currency, processed, result_code, raw)
    VALUES (v_payment.id, p_source, 'cinetpay', v_event_id, p_provider_status, p_amount, p_currency, false, 'CURRENCY_MISMATCH', p_raw);
    RETURN _order_error('CURRENCY_MISMATCH', jsonb_build_object('expected', v_payment.currency, 'received', p_currency));
  END IF;

  -- Correspondance des statuts CinetPay → machine d'état interne.
  v_new_status := CASE
    WHEN p_provider_status = 'ACCEPTED' THEN 'paid'
    WHEN p_provider_status IN ('REFUSED', 'FAILED') THEN 'failed'
    WHEN p_provider_status IN ('CANCELLED', 'CANCELED') THEN 'cancelled'
    WHEN p_provider_status = 'WAITING_FOR_CUSTOMER' THEN 'processing'
    ELSE v_payment.status -- statut inconnu/intermédiaire : on journalise sans changer l'état
  END;

  PERFORM set_config('app.order_rpc', 'on', true);

  IF v_new_status = 'paid' THEN
    SELECT * INTO v_settings FROM payment_settings LIMIT 1;
    v_fee := CASE WHEN COALESCE(v_settings.commission_type, 'percentage') = 'percentage'
                  THEN round(v_payment.amount * COALESCE(v_settings.commission_value, 5) / 100, 2)
                  ELSE LEAST(COALESCE(v_settings.commission_value, 0), v_payment.amount) END;

    UPDATE payments SET
      status = 'paid', paid_at = now(),
      provider_transaction_id = COALESCE(p_provider_transaction_id, provider_transaction_id),
      provider_status = p_provider_status, operator = p_operator,
      phone_number = COALESCE(p_phone_number, phone_number)
    WHERE id = v_payment.id;

    UPDATE orders SET
      payment_status = 'paid', platform_fee = v_fee, seller_amount = v_order.total_amount - v_fee,
      settlement_status = 'pending'
    WHERE id = v_order.id;

    -- Confirmation automatique de la commande (action système, pas un rôle
    -- acheteur/producteur/admin classique) si elle est encore `pending`.
    IF v_order.status = 'pending' THEN
      UPDATE orders SET status = 'confirmed' WHERE id = v_order.id;
      INSERT INTO order_status_history (order_id, status, changed_by, note)
      VALUES (v_order.id, 'confirmed', NULL, 'Confirmation automatique — paiement CinetPay vérifié');
      UPDATE deliveries SET status = 'pending' WHERE order_id = v_order.id;
    END IF;

    INSERT INTO notifications (user_id, type, title, body, link)
    SELECT u, 'payment_confirmed', 'Paiement confirmé',
           'Votre paiement de ' || trim_scale(v_payment.amount)::text || ' ' || v_payment.currency || ' pour la commande ' || v_order.order_number || ' a été confirmé.',
           '/orders/' || v_order.id::text
    FROM unnest(ARRAY[v_order.buyer_id, v_order.producer_id]) AS u;

  ELSIF v_new_status = 'failed' THEN
    UPDATE payments SET
      status = 'failed', failed_at = now(),
      provider_transaction_id = COALESCE(p_provider_transaction_id, provider_transaction_id),
      provider_status = p_provider_status,
      failure_reason = COALESCE(p_raw ->> 'cpm_error_message', p_provider_status)
    WHERE id = v_payment.id;
    UPDATE orders SET payment_status = 'failed' WHERE id = v_order.id;

    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (v_order.buyer_id, 'payment_failed', 'Paiement échoué',
            'Le paiement de la commande ' || v_order.order_number || ' n''a pas abouti. Vous pouvez réessayer.',
            '/orders/' || v_order.id::text);

  ELSIF v_new_status = 'cancelled' THEN
    UPDATE payments SET status = 'cancelled', cancelled_at = now(), provider_status = p_provider_status WHERE id = v_payment.id;
    UPDATE orders SET payment_status = 'cancelled' WHERE id = v_order.id;

  ELSE
    -- Statut intermédiaire (ex. WAITING_FOR_CUSTOMER) : on journalise seulement.
    UPDATE payments SET provider_status = p_provider_status WHERE id = v_payment.id;
  END IF;

  INSERT INTO payment_events (payment_id, event_type, provider, provider_event_id, provider_status, amount, currency, processed, result_code, raw)
  VALUES (v_payment.id, p_source, 'cinetpay', v_event_id, p_provider_status, p_amount, p_currency, true, v_new_status, p_raw);

  RETURN jsonb_build_object('ok', true, 'status', v_new_status);
END;
$$;

-- ============================================================
-- 13. Remboursement (manuel tant qu'aucune API CinetPay n'est branchée)
-- ============================================================
CREATE OR REPLACE FUNCTION request_refund(p_order_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order orders%ROWTYPE;
  v_payment payments%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN _order_error('NOT_AUTHENTICATED');
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND OR (v_order.buyer_id <> v_uid AND v_order.producer_id <> v_uid AND NOT is_admin()) THEN
    RETURN _order_error('ORDER_NOT_FOUND');
  END IF;
  IF v_order.payment_status <> 'paid' THEN
    RETURN _order_error('INVALID_PAYMENT_STATE');
  END IF;

  SELECT * INTO v_payment FROM payments WHERE order_id = p_order_id AND status = 'paid' ORDER BY paid_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN _order_error('PAYMENT_NOT_FOUND');
  END IF;
  IF EXISTS (SELECT 1 FROM refunds WHERE payment_id = v_payment.id AND status IN ('requested', 'processing')) THEN
    RETURN _order_error('REFUND_ALREADY_REQUESTED');
  END IF;

  INSERT INTO refunds (order_id, payment_id, requested_by, amount, currency, reason)
  VALUES (p_order_id, v_payment.id, v_uid, v_payment.amount, v_payment.currency, NULLIF(btrim(COALESCE(p_reason, '')), ''));

  INSERT INTO notifications (user_id, type, title, body, link)
  SELECT user_id, 'refund_requested', 'Remboursement demandé', 'Commande ' || v_order.order_number, '/admin'
  FROM profiles WHERE role = 'admin';

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION admin_process_refund(p_refund_id uuid, p_new_status text, p_provider_reference text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refund refunds%ROWTYPE;
BEGIN
  IF NOT is_admin() THEN
    RETURN _order_error('FORBIDDEN');
  END IF;
  IF p_new_status NOT IN ('processing', 'completed', 'failed') THEN
    RETURN _order_error('INVALID_STATUS');
  END IF;

  SELECT * INTO v_refund FROM refunds WHERE id = p_refund_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN _order_error('REFUND_NOT_FOUND');
  END IF;
  IF (v_refund.status = 'requested' AND p_new_status NOT IN ('processing', 'failed'))
     OR (v_refund.status = 'processing' AND p_new_status NOT IN ('completed', 'failed'))
     OR v_refund.status IN ('completed', 'failed') THEN
    RETURN _order_error('INVALID_TRANSITION');
  END IF;

  UPDATE refunds SET status = p_new_status, provider_reference = COALESCE(p_provider_reference, provider_reference), processed_by = auth.uid()
  WHERE id = p_refund_id;

  IF p_new_status = 'completed' THEN
    PERFORM set_config('app.order_rpc', 'on', true);
    UPDATE payments SET status = 'refunded', refunded_at = now() WHERE id = v_refund.payment_id;
    UPDATE orders SET payment_status = 'refunded' WHERE id = v_refund.order_id;
    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES ((SELECT buyer_id FROM orders WHERE id = v_refund.order_id), 'refund_completed', 'Remboursement effectué',
            'Votre remboursement de ' || trim_scale(v_refund.amount)::text || ' ' || v_refund.currency || ' a été traité.',
            '/orders/' || v_refund.order_id::text);
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ============================================================
-- 14. Configuration des moyens de paiement (lecture publique restreinte)
-- ============================================================
CREATE OR REPLACE FUNCTION get_payment_methods()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('enabled_methods', enabled_methods, 'method_currencies', method_currencies)
  FROM payment_settings LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION admin_update_payment_settings(
  p_commission_type text,
  p_commission_value numeric,
  p_enabled_methods jsonb,
  p_method_currencies jsonb,
  p_environment text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RETURN _order_error('FORBIDDEN');
  END IF;
  IF p_commission_type NOT IN ('percentage', 'fixed') THEN
    RETURN _order_error('INVALID_REQUEST');
  END IF;
  IF p_environment NOT IN ('sandbox', 'production') THEN
    RETURN _order_error('INVALID_REQUEST');
  END IF;

  UPDATE payment_settings SET
    commission_type = p_commission_type,
    commission_value = p_commission_value,
    enabled_methods = p_enabled_methods,
    method_currencies = p_method_currencies,
    cinetpay_environment = p_environment,
    updated_by = auth.uid()
  WHERE id = true;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ============================================================
-- 15. Fonction retirée : apply_provider_payment_event (jamais utilisée en
-- production, remplacée par payment_apply_result ci-dessus).
-- ============================================================
DROP FUNCTION IF EXISTS apply_provider_payment_event(uuid, text, text, text);

-- ============================================================
-- 16. DROITS D'EXÉCUTION
-- ============================================================
REVOKE ALL ON FUNCTION create_order_from_cart(uuid, jsonb, jsonb, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_order_from_cart(uuid, jsonb, jsonb, text, numeric) TO authenticated;

REVOKE ALL ON FUNCTION transition_order_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transition_order_status(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION confirm_cash_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION confirm_cash_payment(uuid) TO authenticated;

REVOKE ALL ON FUNCTION payment_initiate_begin(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION payment_initiate_begin(uuid, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION payment_provider_attach(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION payment_provider_attach(uuid, text, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION payment_apply_result(text, text, text, numeric, text, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION payment_apply_result(text, text, text, numeric, text, text, text, text, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION request_refund(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION request_refund(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION admin_process_refund(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_process_refund(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION get_payment_methods() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_payment_methods() TO anon, authenticated;

REVOKE ALL ON FUNCTION admin_update_payment_settings(text, numeric, jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_update_payment_settings(text, numeric, jsonb, jsonb, text) TO authenticated;
