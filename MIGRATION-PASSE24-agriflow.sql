/*
# AgriFlow RDC — Production hardening (Passe 24)

1. PAIEMENT
   - `payments.initiating_since` + BAIL D'INITIATION de 90 s dans `payment_initiate_begin` : deux requêtes simultanées pour la
     même commande ne peuvent plus lancer deux transactions CinetPay (la seconde reçoit INITIATION_IN_PROGRESS) ;
     `payment_initiation_release` (service_role) libère le bail si l'appel prestataire échoue.
   - `payment_apply_result` : refuse de confirmer (AMOUNT_MISSING) un paiement dont le prestataire n'a pas rapporté montant ET devise.
2. NOTIFICATIONS E-MAIL : retry BORNÉ (3 essais maximum, 15 min entre deux) via `notification_deliveries.attempts`.
3. INDEX — uniquement ceux justifiés par les requêtes réelles de l'application (analyse dans docs/ARCHITECTURE.md) :
   les index simples devenus redondants (préfixe d'un composite) sont retirés ; les index composites servent les listes paginées
   `ORDER BY created_at DESC, id`. `CREATE INDEX` sans CONCURRENTLY (compatible SQL Editor) : sur une grosse table de production,
   exécuter les créations séparément avec `CREATE INDEX CONCURRENTLY`.
Aucune policy RLS n'est supprimée ni modifiée. Idempotente (rejouable).
*/

ALTER TABLE payments ADD COLUMN IF NOT EXISTS initiating_since timestamptz;

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

  -- Passe 24 : BAIL D'INITIATION. Entre `payment_initiate_begin` (cette fonction) et `payment_provider_attach`, la tentative est
  -- `pending` sans URL : une seconde requête simultanée relancerait CinetPay avec le même transaction_id. Tant que le bail
  -- (90 s) est valide, on refuse proprement ; il est libéré sur échec (payment_initiation_release) ou expire seul.
  IF v_payment.status = 'pending' AND v_payment.checkout_url IS NULL
     AND v_payment.initiating_since IS NOT NULL AND v_payment.initiating_since > now() - interval '90 seconds' THEN
    RETURN _order_error('INITIATION_IN_PROGRESS');
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
    failure_reason = NULL,
    initiating_since = now()
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
    status = 'processing',
    initiating_since = NULL
  WHERE id = p_payment_id;

  PERFORM set_config('app.order_rpc', 'on', true);
  UPDATE orders SET payment_status = 'processing'
  WHERE id = v_payment.order_id AND payment_status IN ('pending');

  INSERT INTO payment_events (payment_id, event_type, provider, provider_event_id, provider_status, processed, raw)
  VALUES (p_payment_id, 'initiated', 'cinetpay', p_provider_transaction_id, 'INITIATED', true, p_raw);

  RETURN jsonb_build_object('ok', true);
END;
$$;

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

  -- Passe 24 : un paiement n'est JAMAIS confirmé sans montant ET devise rapportés par le prestataire
  -- (jusqu'ici un montant NULL contournait le contrôle d'égalité avec le montant calculé côté serveur).
  IF v_new_status = 'paid' AND (p_amount IS NULL OR p_currency IS NULL) THEN
    INSERT INTO payment_events (payment_id, event_type, provider, provider_event_id, provider_status, amount, currency, processed, result_code, raw)
    VALUES (v_payment.id, p_source, 'cinetpay', v_event_id, p_provider_status, p_amount, p_currency, false, 'AMOUNT_MISSING', p_raw);
    RETURN _order_error('AMOUNT_MISSING');
  END IF;

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

    -- Passe 23 : le paiement ne confirme PLUS la commande à la place du producteur.
    -- La commande reste `pending` = « confirmation du producteur en attente » ; le délai de
    -- confirmation démarre maintenant (le producteur peut enfin agir) et il est notifié.
    IF v_order.status = 'pending' THEN
      UPDATE orders SET confirmation_deadline = COALESCE(confirmation_deadline, now() + _order_confirmation_timeout())
      WHERE id = v_order.id;
      PERFORM _log_order_event(v_order.id, 'payment_confirmed', NULL,
        jsonb_build_object('amount', v_payment.amount, 'currency', v_payment.currency), 'payment_paid');
      PERFORM _notify(v_order.producer_id, 'order_to_confirm', 'Commande payée : à confirmer',
        'La commande ' || v_order.order_number || ' est payée. Confirmez-la avant le '
          || _fmt_deadline((SELECT confirmation_deadline FROM orders WHERE id = v_order.id)) || '.',
        '/orders/' || v_order.id::text, 'to_confirm:' || v_order.id::text);
      PERFORM _log_order_event(v_order.id, 'producer_notified', NULL, jsonb_build_object('channel', 'in_app', 'level', 1, 'after', 'payment'), 'notified:payment');
    ELSIF v_order.status = 'cancelled' THEN
      -- Paiement arrivé APRÈS l'annulation/expiration : jamais oublié, une demande de remboursement est créée.
      PERFORM _request_refund_for_cancelled_order(v_order.id);
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

CREATE OR REPLACE FUNCTION payment_initiation_release(p_payment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RETURN _order_error('FORBIDDEN'); END IF;
  UPDATE payments SET initiating_since = NULL
  WHERE id = p_payment_id AND status = 'pending' AND checkout_url IS NULL;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---- Droits : mêmes que les versions précédentes (CREATE OR REPLACE conserve les privilèges ; on réaffirme)
REVOKE ALL ON FUNCTION payment_initiation_release(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION payment_initiation_release(uuid) TO service_role;
REVOKE ALL ON FUNCTION payment_apply_result(text, text, text, numeric, text, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION payment_apply_result(text, text, text, numeric, text, text, text, text, text, jsonb) TO service_role;
REVOKE ALL ON FUNCTION payment_provider_attach(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION payment_provider_attach(uuid, text, text, jsonb) TO service_role;

-- ============================================================
-- Notifications e-mail : retry borné (3 essais, 15 min d'écart)
-- ============================================================
ALTER TABLE notification_deliveries ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 1;
ALTER TABLE notification_deliveries ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION record_notification_delivery(p_notification_id uuid, p_channel text, p_provider text, p_status text, p_failure_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RETURN _order_error('FORBIDDEN'); END IF;
  IF p_channel NOT IN ('email', 'sms', 'push') OR p_status NOT IN ('sent', 'failed') THEN RETURN _order_error('INVALID_REQUEST'); END IF;
  INSERT INTO notification_deliveries (notification_id, channel, provider, status, sent_at, failure_reason, attempts, last_attempt_at)
  VALUES (p_notification_id, p_channel, p_provider, p_status, CASE WHEN p_status = 'sent' THEN now() END, left(p_failure_reason, 300), 1, now())
  ON CONFLICT (notification_id, channel) DO UPDATE
    SET status = EXCLUDED.status, provider = EXCLUDED.provider, sent_at = EXCLUDED.sent_at, failure_reason = EXCLUDED.failure_reason,
        attempts = notification_deliveries.attempts + 1, last_attempt_at = now()
    WHERE notification_deliveries.status = 'failed';   -- un envoi réussi n'est jamais réécrit
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION notifications_pending_email(p_since interval DEFAULT interval '48 hours', p_limit integer DEFAULT 100)
RETURNS TABLE (notification_id uuid, user_id uuid, email text, type text, title text, body text, link text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RETURN; END IF;
  RETURN QUERY
  SELECT n.id, n.user_id, u.email::text, n.type, n.title, n.body, n.link
  FROM notifications n JOIN auth.users u ON u.id = n.user_id
  WHERE n.created_at > now() - p_since
    AND n.type IN ('new_order', 'order_to_confirm', 'order_reminder', 'order_last_reminder', 'order_expired', 'order_cancelled', 'payment_refund_pending')
    AND u.email IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM notification_deliveries d
      WHERE d.notification_id = n.id AND d.channel = 'email'
        AND (d.status = 'sent' OR d.attempts >= 3 OR d.last_attempt_at > now() - interval '15 minutes'))
  ORDER BY n.created_at LIMIT LEAST(p_limit, 200);
END;
$$;

REVOKE ALL ON FUNCTION record_notification_delivery(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_notification_delivery(uuid, text, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION notifications_pending_email(interval, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION notifications_pending_email(interval, integer) TO service_role;

-- ============================================================
-- Index (voir docs/ARCHITECTURE.md § Index pour la requête qui justifie chacun)
-- ============================================================
-- Marketplace : WHERE status='available' ORDER BY created_at DESC, id  (et variantes tri par prix)
CREATE INDEX IF NOT EXISTS idx_products_available_recent ON products (created_at DESC, id) WHERE status = 'available';
CREATE INDEX IF NOT EXISTS idx_products_available_price ON products (price, created_at DESC, id) WHERE status = 'available';
-- « Mes produits » + policies RLS sur products.user_id : AUCUN index sur user_id n'existait
CREATE INDEX IF NOT EXISTS idx_products_user_created ON products (user_id, created_at DESC, id);

-- Listes de commandes paginées (acheteur / producteur) : WHERE buyer_id|producer_id = ? ORDER BY created_at DESC, id DESC
CREATE INDEX IF NOT EXISTS idx_orders_buyer_created ON orders (buyer_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_orders_producer_created ON orders (producer_id, created_at DESC, id DESC);
DROP INDEX IF EXISTS idx_orders_buyer;      -- préfixe de idx_orders_buyer_created
DROP INDEX IF EXISTS idx_orders_producer;   -- préfixe de idx_orders_producer_created

-- Notifications : liste paginée WHERE user_id = ? ORDER BY created_at DESC, id DESC ; compteur non lues = idx_notif_user_unread
CREATE INDEX IF NOT EXISTS idx_notif_user_created ON notifications (user_id, created_at DESC, id DESC);
DROP INDEX IF EXISTS idx_notif_user;        -- préfixe de idx_notif_user_created
DROP INDEX IF EXISTS idx_notif_read;        -- booléen seul : jamais utilisé par une requête de l'application

-- Paiements d'une commande : WHERE order_id = ? ORDER BY created_at DESC LIMIT 1 (payment_initiate_begin, détail commande)
CREATE INDEX IF NOT EXISTS idx_payments_order_created ON payments (order_id, created_at DESC);
DROP INDEX IF EXISTS idx_payments_order;

-- Historique de commande : WHERE order_id = ? ORDER BY created_at
CREATE INDEX IF NOT EXISTS idx_history_order_created ON order_status_history (order_id, created_at);
DROP INDEX IF EXISTS idx_history_order;

-- Demandes Agri-Match : WHERE user_id = ? ORDER BY created_at DESC ; WHERE status='open' ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_requests_user_created ON buyer_requests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_open_recent ON buyer_requests (created_at DESC) WHERE status = 'open';

-- Remboursements : embarqués dans le détail d'une commande (order_id) et NOT EXISTS (payment_id, statut) dans _request_refund_for_cancelled_order
CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refunds_payment ON refunds (payment_id);

-- Doublons stricts / préfixes d'un index unique existant
DROP INDEX IF EXISTS idx_delivery_order;    -- identique à uq_deliveries_order (order_id)
DROP INDEX IF EXISTS idx_fav_user;          -- préfixe de favorites_user_id_product_id_key (user_id, product_id)

-- ============================================================
-- Storage : limites appliquées PAR LE SERVICE de stockage (validation côté serveur, indépendante du frontend)
-- ============================================================
-- 5 Mo maximum, images JPEG / PNG / WebP uniquement. Colonnes présentes sur Supabase ; ignoré proprement ailleurs.
DO $storage$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'file_size_limit')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'allowed_mime_types') THEN
    UPDATE storage.buckets
    SET file_size_limit = 5242880, allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
    WHERE id IN ('avatars', 'product-images');
  END IF;
END
$storage$;
