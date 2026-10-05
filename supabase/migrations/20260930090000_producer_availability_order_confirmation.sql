/*
# AgriFlow RDC — Producteur inactif : disponibilité, confirmation, rappels, expiration (Passe 23)

## Problème résolu
Un acheteur commande (et éventuellement paie) ; le producteur est absent ; la commande restait
`pending` indéfiniment. Cette migration ajoute, SANS nouvelle machine à états (les statuts
`orders.status` / `payment_status` / `deliveries.status` restent ceux existants) :

1. DISPONIBILITÉ : `profiles.is_available_for_orders`, `availability_until` (réactivation automatique)
   et `last_seen_at` (dernière activité RÉELLE, écrite uniquement par `touch_last_seen()`, limitée à
   1 écriture / 2 min côté serveur — jamais `updated_at`). `last_seen_at` n'est PAS lisible par
   colonne : seule `get_producer_presence()` l'expose, et uniquement pour les rôles producteur /
   coopérative (aucune fuite d'activité des acheteurs).
2. DÉLAI CONFIGURABLE : table `order_confirmation_settings` (une ligne : délai, 1er rappel, dernier
   rappel, en heures). Rien n'est codé en dur dans les fonctions.
3. COMMANDE : `orders.confirmation_deadline`, `confirmed_at`, `expired_at`, `cancel_reason`.
   Le délai démarre quand le producteur PEUT agir : à la création pour le paiement à la livraison, à
   la confirmation du paiement pour Mobile Money / carte (voir `payment_apply_result` ci-dessous :
   le paiement ne confirme plus automatiquement la commande, c'est le producteur qui confirme).
   Une commande expirée passe à l'état EXISTANT `cancelled` avec `cancel_reason = 'confirmation_expired'`.
4. JOURNAL : `order_events` (idempotent par `dedupe_key`) et `notification_deliveries`
   (canal / fournisseur / statut / sent_at / failure_reason).
5. NOTIFICATIONS IDEMPOTENTES : `notifications.dedupe_key` + index unique (user_id, dedupe_key).
6. TÂCHE SERVEUR : `_order_confirmation_maintenance()` (rappels puis expiration, verrous
   `FOR UPDATE SKIP LOCKED`, rejouable sans effet) ; `run_order_confirmation_maintenance()` = point
   d'entrée service_role pour l'Edge Function `order-confirmation-cron` ; planification pg_cron
   automatique SI l'extension est disponible.
7. PAIEMENT : une commande annulée/expirée dont le paiement est `paid` crée UNE demande de
   remboursement (`refunds.status = 'requested'`). Rien n'est jamais marqué « remboursé » sans
   `admin_process_refund(..., 'completed')`.
8. ALTERNATIVES : `order_alternatives(order_id)` — produits réellement disponibles en base.
9. Les commandes antérieures encore `pending` (paiement à la livraison ou déjà payées) reçoivent un
   nouveau délai complet à partir de cette migration ; aucune n'est expirée rétroactivement.

Aucun DROP destructif. Idempotente (rejouable).
*/

-- ============================================================
-- 1. PROFILES : disponibilité + dernière activité
-- ============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_available_for_orders boolean NOT NULL DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS availability_until timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

-- Les privilèges de colonne de profiles (migration auth_roles_rls_hardening) excluent `phone`.
-- On ajoute la disponibilité (publique, utile au marketplace) mais PAS last_seen_at.
GRANT SELECT (is_available_for_orders, availability_until) ON profiles TO anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON profiles(last_seen_at DESC) WHERE last_seen_at IS NOT NULL;

-- updated_at ne bouge pas quand SEUL last_seen_at change ; last_seen_at n'est modifiable que par la RPC.
CREATE OR REPLACE FUNCTION profiles_before_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.last_seen_at IS DISTINCT FROM OLD.last_seen_at THEN
    IF NOT (is_admin() OR current_setting('app.presence_rpc', true) = 'on') THEN
      RAISE EXCEPTION 'Modification de la dernière activité non autorisée';
    END IF;
    IF (to_jsonb(NEW) - 'last_seen_at' - 'updated_at') = (to_jsonb(OLD) - 'last_seen_at' - 'updated_at') THEN
      NEW.updated_at := OLD.updated_at;
      RETURN NEW;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_updated ON profiles;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION profiles_before_update();

-- ============================================================
-- 2. CONFIGURATION CENTRALISÉE DU DÉLAI DE CONFIRMATION
-- ============================================================
CREATE TABLE IF NOT EXISTS order_confirmation_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  timeout_hours numeric NOT NULL DEFAULT 24 CHECK (timeout_hours > 0 AND timeout_hours <= 168),
  reminder_after_hours numeric NOT NULL DEFAULT 8 CHECK (reminder_after_hours > 0),
  last_reminder_before_hours numeric NOT NULL DEFAULT 4 CHECK (last_reminder_before_hours > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT order_confirmation_settings_coherent
    CHECK (reminder_after_hours + last_reminder_before_hours < timeout_hours)
);
INSERT INTO order_confirmation_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE order_confirmation_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "order_confirmation_settings_admin_all" ON order_confirmation_settings;
CREATE POLICY "order_confirmation_settings_admin_all" ON order_confirmation_settings FOR ALL
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE OR REPLACE FUNCTION _order_confirmation_timeout()
RETURNS interval LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT make_interval(secs => (SELECT timeout_hours FROM order_confirmation_settings LIMIT 1) * 3600);
$$;

CREATE OR REPLACE FUNCTION get_order_confirmation_settings()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('timeout_hours', timeout_hours, 'reminder_after_hours', reminder_after_hours,
                            'last_reminder_before_hours', last_reminder_before_hours)
  FROM order_confirmation_settings LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION admin_update_order_confirmation_settings(p_timeout numeric, p_reminder numeric, p_last numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RETURN _order_error('FORBIDDEN'); END IF;
  IF p_timeout IS NULL OR p_reminder IS NULL OR p_last IS NULL
     OR p_timeout <= 0 OR p_timeout > 168 OR p_reminder <= 0 OR p_last <= 0
     OR p_reminder + p_last >= p_timeout THEN
    RETURN _order_error('INVALID_SETTINGS');
  END IF;
  UPDATE order_confirmation_settings
  SET timeout_hours = p_timeout, reminder_after_hours = p_reminder, last_reminder_before_hours = p_last, updated_by = auth.uid()
  WHERE id = true;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ============================================================
-- 3. ORDERS : confirmation, expiration, motif d'annulation
-- ============================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmation_deadline timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS expired_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancel_reason text;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_cancel_reason_check;
ALTER TABLE orders ADD CONSTRAINT orders_cancel_reason_check
  CHECK (cancel_reason IS NULL OR cancel_reason IN
    ('confirmation_expired', 'producer_rejected', 'producer_cancelled', 'buyer_cancelled', 'admin_cancelled'));

CREATE INDEX IF NOT EXISTS idx_orders_pending_deadline ON orders(confirmation_deadline)
  WHERE status = 'pending' AND confirmation_deadline IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_producer_status ON orders(producer_id, status);

-- Reprise de l'existant (une seule fois, sans effet si déjà fait).
UPDATE orders o SET confirmed_at = h.created_at
FROM (SELECT order_id, min(created_at) AS created_at FROM order_status_history WHERE status = 'confirmed' GROUP BY order_id) h
WHERE o.id = h.order_id AND o.confirmed_at IS NULL AND o.status <> 'pending';

UPDATE orders SET confirmation_deadline = now() + _order_confirmation_timeout()
WHERE status = 'pending' AND confirmation_deadline IS NULL
  AND (payment_method = 'cash_on_delivery' OR payment_status = 'paid');

-- ============================================================
-- 4. JOURNAL D'ÉVÉNEMENTS + LIVRAISON DES NOTIFICATIONS
-- ============================================================
-- Types utilisés : order_created, producer_notified, payment_confirmed, producer_reminder_sent,
-- producer_confirmed, producer_rejected, producer_cancelled, buyer_cancelled, order_cancelled,
-- confirmation_expired, buyer_notified, alternative_offered, payment_refund_requested,
-- payment_refund_processing, payment_refund_confirmed.
CREATE TABLE IF NOT EXISTS order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_events_dedupe ON order_events(order_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(order_id, created_at);

ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "order_events_participant_read" ON order_events;
CREATE POLICY "order_events_participant_read" ON order_events FOR SELECT
  TO authenticated USING (EXISTS (
    SELECT 1 FROM orders WHERE orders.id = order_events.order_id
      AND (orders.buyer_id = auth.uid() OR orders.producer_id = auth.uid())));
DROP POLICY IF EXISTS "order_events_admin_all" ON order_events;
CREATE POLICY "order_events_admin_all" ON order_events FOR ALL
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dedupe_key text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_dedupe ON notifications(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notif_user_unread ON notifications(user_id, is_read, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('in_app', 'email', 'sms', 'push')),
  provider text,
  status text NOT NULL CHECK (status IN ('sent', 'failed')),
  sent_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_id, channel)
);
ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notification_deliveries_admin_read" ON notification_deliveries;
CREATE POLICY "notification_deliveries_admin_read" ON notification_deliveries FOR SELECT
  TO authenticated USING (is_admin());

-- Un seul remboursement actif par paiement (idempotence des demandes automatiques).
CREATE UNIQUE INDEX IF NOT EXISTS uq_refunds_active_payment ON refunds(payment_id) WHERE status IN ('requested', 'processing');

-- ============================================================
-- 5. FONCTIONS INTERNES (jamais exposées aux clients)
-- ============================================================
CREATE OR REPLACE FUNCTION _log_order_event(p_order uuid, p_type text, p_actor uuid, p_meta jsonb DEFAULT '{}'::jsonb, p_dedupe text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO order_events (order_id, event_type, actor_id, metadata, dedupe_key)
  VALUES (p_order, p_type, p_actor, COALESCE(p_meta, '{}'::jsonb), p_dedupe)
  ON CONFLICT (order_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  RETURN FOUND;
END;
$$;

-- Notification in-app idempotente : renvoie l'id créé, ou NULL si (user, dedupe_key) existe déjà.
CREATE OR REPLACE FUNCTION _notify(p_user uuid, p_type text, p_title text, p_body text, p_link text, p_dedupe text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF p_user IS NULL THEN RETURN NULL; END IF;
  INSERT INTO notifications (user_id, type, title, body, link, dedupe_key)
  VALUES (p_user, p_type, p_title, p_body, p_link, p_dedupe)
  ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NOT NULL THEN
    INSERT INTO notification_deliveries (notification_id, channel, provider, status, sent_at)
    VALUES (v_id, 'in_app', 'internal', 'sent', now()) ON CONFLICT DO NOTHING;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION _fmt_deadline(p_ts timestamptz)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT to_char(p_ts AT TIME ZONE 'Africa/Kinshasa', 'DD/MM/YYYY "à" HH24:MI');
$$;

CREATE OR REPLACE FUNCTION producer_accepting(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT is_available_for_orders OR (availability_until IS NOT NULL AND availability_until <= now())
     FROM profiles WHERE user_id = p_user), true);
$$;

-- Demande de remboursement à traiter (jamais « remboursé » ici). Idempotente.
CREATE OR REPLACE FUNCTION _request_refund_for_cancelled_order(p_order uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order orders%ROWTYPE; v_refund uuid;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order;
  IF NOT FOUND OR v_order.status <> 'cancelled' OR v_order.payment_status <> 'paid' THEN RETURN false; END IF;

  INSERT INTO refunds (order_id, payment_id, requested_by, amount, currency, reason)
  SELECT v_order.id, p.id, v_order.buyer_id, p.amount, p.currency,
         'Commande annulée après paiement (' || COALESCE(v_order.cancel_reason, 'annulation') || ')'
  FROM payments p
  WHERE p.order_id = v_order.id AND p.status = 'paid'
    AND NOT EXISTS (SELECT 1 FROM refunds r WHERE r.payment_id = p.id AND r.status IN ('requested', 'processing', 'completed'))
  ORDER BY p.paid_at DESC NULLS LAST
  LIMIT 1
  RETURNING id INTO v_refund;
  IF v_refund IS NULL THEN RETURN false; END IF;

  PERFORM _log_order_event(v_order.id, 'payment_refund_requested', NULL,
    jsonb_build_object('refund_id', v_refund, 'cancel_reason', v_order.cancel_reason), 'refund_requested:' || v_refund::text);
  PERFORM _notify(v_order.buyer_id, 'payment_refund_pending', 'Remboursement à traiter',
    'Votre commande ' || v_order.order_number || ' est annulée alors que votre paiement a été reçu. Une demande de remboursement a été enregistrée : elle sera traitée par l''équipe AgriFlow. Aucun remboursement n''est encore confirmé.',
    '/orders/' || v_order.id::text, 'refund_pending:' || v_refund::text);
  INSERT INTO notifications (user_id, type, title, body, link, dedupe_key)
  SELECT pr.user_id, 'refund_requested', 'Remboursement à traiter', 'Commande ' || v_order.order_number, '/admin', 'refund_requested:' || v_refund::text
  FROM profiles pr WHERE pr.role = 'admin'
  ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  RETURN true;
END;
$$;

-- ============================================================
-- 6. TRIGGERS SUR ORDERS
-- ============================================================
-- 6a. À la création : bloque un producteur indisponible (défense serveur) et fixe l'échéance.
CREATE OR REPLACE FUNCTION orders_before_insert_confirmation()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT producer_accepting(NEW.producer_id) THEN
    RAISE EXCEPTION 'PRODUCER_UNAVAILABLE';
  END IF;
  IF NEW.confirmation_deadline IS NULL AND NEW.status = 'pending'
     AND (NEW.payment_method = 'cash_on_delivery' OR NEW.payment_status = 'paid') THEN
    NEW.confirmation_deadline := now() + _order_confirmation_timeout();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_orders_before_insert_confirmation ON orders;
CREATE TRIGGER trg_orders_before_insert_confirmation BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_before_insert_confirmation();

CREATE OR REPLACE FUNCTION orders_after_insert_events()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM _log_order_event(NEW.id, 'order_created', NEW.buyer_id,
    jsonb_build_object('payment_method', NEW.payment_method, 'total_amount', NEW.total_amount, 'currency', NEW.currency,
                       'confirmation_deadline', NEW.confirmation_deadline), 'created');
  PERFORM _log_order_event(NEW.id, 'producer_notified', NEW.buyer_id,
    jsonb_build_object('channel', 'in_app', 'level', 1), 'notified:1');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_orders_after_insert_events ON orders;
CREATE TRIGGER trg_orders_after_insert_events AFTER INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_after_insert_events();

-- 6b. Changement de statut : confirmed_at, motif d'annulation.
CREATE OR REPLACE FUNCTION orders_before_update_lifecycle()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'pending' AND NEW.status = 'confirmed' AND NEW.confirmed_at IS NULL THEN
      NEW.confirmed_at := now();
    END IF;
    IF NEW.status = 'cancelled' AND NEW.cancel_reason IS NULL THEN
      NEW.cancel_reason := CASE
        WHEN auth.uid() = OLD.producer_id AND OLD.status = 'pending' THEN 'producer_rejected'
        WHEN auth.uid() = OLD.producer_id THEN 'producer_cancelled'
        WHEN auth.uid() = OLD.buyer_id THEN 'buyer_cancelled'
        ELSE 'admin_cancelled' END;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_orders_before_update_lifecycle ON orders;
CREATE TRIGGER trg_orders_before_update_lifecycle BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_before_update_lifecycle();

CREATE OR REPLACE FUNCTION orders_after_update_events()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'pending' AND NEW.status = 'confirmed' THEN
      PERFORM _log_order_event(NEW.id, 'producer_confirmed', auth.uid(),
        jsonb_build_object('before_deadline', NEW.confirmation_deadline IS NULL OR now() <= NEW.confirmation_deadline), 'confirmed');
      PERFORM _log_order_event(NEW.id, 'buyer_notified', auth.uid(), jsonb_build_object('channel', 'in_app', 'about', 'confirmed'), 'buyer_notified:confirmed');
    ELSIF NEW.status = 'cancelled' AND NEW.cancel_reason <> 'confirmation_expired' THEN
      PERFORM _log_order_event(NEW.id,
        CASE NEW.cancel_reason WHEN 'producer_rejected' THEN 'producer_rejected'
                               WHEN 'producer_cancelled' THEN 'producer_cancelled'
                               WHEN 'buyer_cancelled' THEN 'buyer_cancelled'
                               ELSE 'order_cancelled' END,
        auth.uid(), jsonb_build_object('cancel_reason', NEW.cancel_reason), 'cancelled');
      PERFORM _log_order_event(NEW.id, 'buyer_notified', auth.uid(), jsonb_build_object('channel', 'in_app', 'about', 'cancelled'), 'buyer_notified:cancelled');
    END IF;
    IF NEW.status = 'cancelled' AND NEW.payment_status = 'paid' THEN
      PERFORM _request_refund_for_cancelled_order(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_orders_after_update_events ON orders;
CREATE TRIGGER trg_orders_after_update_events AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_after_update_events();

-- 6c. Remboursement confirmé / en cours : trace dans le journal (la confirmation vient de l'admin).
CREATE OR REPLACE FUNCTION refunds_after_update_events()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('processing', 'completed', 'failed') THEN
    PERFORM _log_order_event(NEW.order_id,
      CASE NEW.status WHEN 'completed' THEN 'payment_refund_confirmed'
                      WHEN 'processing' THEN 'payment_refund_processing' ELSE 'payment_refund_failed' END,
      auth.uid(), jsonb_build_object('refund_id', NEW.id, 'provider_reference', NEW.provider_reference),
      'refund_' || NEW.status || ':' || NEW.id::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_refunds_after_update_events ON refunds;
CREATE TRIGGER trg_refunds_after_update_events AFTER UPDATE ON refunds
  FOR EACH ROW EXECUTE FUNCTION refunds_after_update_events();

-- 6d. Notification « nouvelle commande » enrichie (produit, quantité, montant, acheteur, délai).
-- create_order_from_cart insère la notification après les lignes de commande : on les relit ici,
-- sans redéfinir la RPC de checkout (aucun risque de régression sur le panier).
CREATE OR REPLACE FUNCTION notifications_enrich_new_order()
RETURNS TRIGGER AS $$
DECLARE
  v_order orders%ROWTYPE; v_buyer text; v_n integer; v_name text; v_qty text; v_what text; v_when text;
BEGIN
  IF NEW.type <> 'new_order' OR NEW.link IS NULL OR NEW.link !~ '^/orders/[0-9a-f-]{36}$' THEN RETURN NEW; END IF;
  SELECT * INTO v_order FROM orders WHERE id = substring(NEW.link from 9)::uuid;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT count(*), min(product_name), min(trim_scale(quantity)::text || ' ' || unit)
  INTO v_n, v_name, v_qty FROM order_items WHERE order_id = v_order.id;
  SELECT full_name INTO v_buyer FROM profiles WHERE user_id = v_order.buyer_id;
  v_what := CASE WHEN v_n = 1 THEN v_name || ' (' || v_qty || ')'
                 WHEN v_n > 1 THEN v_n::text || ' produits' ELSE 'Commande' END;
  v_when := CASE
    WHEN v_order.confirmation_deadline IS NOT NULL THEN 'à confirmer avant le ' || _fmt_deadline(v_order.confirmation_deadline)
    ELSE 'en attente du paiement de l''acheteur (le délai de confirmation démarre au paiement)' END;
  NEW.body := v_order.order_number || ' — ' || v_what || ' — ' || trim_scale(v_order.total_amount)::text || ' ' || v_order.currency
           || ' — acheteur : ' || COALESCE(v_buyer, 'client AgriFlow') || ' — ' || v_when;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_notifications_enrich_new_order ON notifications;
CREATE TRIGGER trg_notifications_enrich_new_order BEFORE INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION notifications_enrich_new_order();

-- ============================================================
-- 7. PRÉSENCE ET DISPONIBILITÉ (RPC authentifiées)
-- ============================================================
-- Écriture limitée côté serveur : au plus une écriture toutes les 2 minutes par utilisateur,
-- quel que soit le nombre d'appels du client (le client limite déjà à ~5 min).
CREATE OR REPLACE FUNCTION touch_last_seen()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_rows integer;
BEGIN
  IF v_uid IS NULL THEN RETURN _order_error('NOT_AUTHENTICATED'); END IF;
  PERFORM set_config('app.presence_rpc', 'on', true);
  UPDATE profiles SET last_seen_at = now()
  WHERE user_id = v_uid AND (last_seen_at IS NULL OR last_seen_at < now() - interval '2 minutes');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'updated', v_rows > 0);
END;
$$;

CREATE OR REPLACE FUNCTION set_my_availability(p_available boolean, p_until timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_role text;
BEGIN
  IF v_uid IS NULL THEN RETURN _order_error('NOT_AUTHENTICATED'); END IF;
  IF p_available IS NULL THEN RETURN _order_error('INVALID_REQUEST'); END IF;
  SELECT role INTO v_role FROM profiles WHERE user_id = v_uid;
  IF v_role IS NULL OR v_role NOT IN ('producer', 'cooperative') THEN RETURN _order_error('FORBIDDEN'); END IF;
  IF NOT p_available AND p_until IS NOT NULL AND p_until <= now() THEN RETURN _order_error('INVALID_DATE'); END IF;
  UPDATE profiles
  SET is_available_for_orders = p_available,
      availability_until = CASE WHEN p_available THEN NULL ELSE p_until END
  WHERE user_id = v_uid;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Dernière activité : uniquement pour les producteurs / coopératives, jamais pour les acheteurs.
CREATE OR REPLACE FUNCTION get_producer_presence(p_user_ids uuid[])
RETURNS TABLE (user_id uuid, last_seen_at timestamptz, accepting boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.user_id, p.last_seen_at,
         (p.is_available_for_orders OR (p.availability_until IS NOT NULL AND p.availability_until <= now()))
  FROM profiles p
  WHERE p.user_id = ANY (p_user_ids[1:100]) AND p.role IN ('producer', 'cooperative');
$$;

-- ============================================================
-- 8. ALTERNATIVES (produits réellement présents en base)
-- ============================================================
CREATE OR REPLACE FUNCTION _order_alternatives(p_order uuid, p_limit integer DEFAULT 6)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order orders%ROWTYPE; v_city text; v_result jsonb;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order;
  IF NOT FOUND THEN RETURN '[]'::jsonb; END IF;
  SELECT COALESCE(d.city, v_order.delivery_city) INTO v_city FROM (SELECT 1) x LEFT JOIN deliveries d ON d.order_id = v_order.id;

  SELECT COALESCE(jsonb_agg(to_jsonb(r) - 'rank_same' - 'rank_city' - 'rank_qty' ORDER BY r.rank_same DESC, r.rank_qty DESC, r.rank_city DESC, r.created_at DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT * FROM (
      SELECT DISTINCT ON (p.id)
        p.id AS product_id, p.name, p.category, p.quantity, p.unit, p.price, p.currency, p.city, p.province,
        p.images[1] AS image, p.user_id AS producer_id, pr.full_name AS producer_name, pr.is_verified,
        (p.quantity >= w.quantity) AS covers_quantity,
        (lower(p.name) = lower(w.product_name)) AS same_product,
        (lower(p.name) = lower(w.product_name))::int AS rank_same,
        (p.quantity >= w.quantity)::int AS rank_qty,
        (v_city IS NOT NULL AND lower(COALESCE(p.city, '')) = lower(v_city))::int AS rank_city,
        p.created_at
      FROM products p
      JOIN profiles pr ON pr.user_id = p.user_id
      JOIN (
        SELECT oi.product_name, pp.category, oi.quantity
        FROM order_items oi LEFT JOIN products pp ON pp.id = oi.product_id
        WHERE oi.order_id = v_order.id
      ) w ON lower(p.name) = lower(w.product_name) OR (w.category IS NOT NULL AND p.category = w.category)
      WHERE p.status = 'available' AND p.quantity > 0 AND p.price > 0
        AND p.user_id <> v_order.producer_id AND p.user_id <> v_order.buyer_id
        AND producer_accepting(p.user_id)
      ORDER BY p.id, (lower(p.name) = lower(w.product_name)) DESC, (p.quantity >= w.quantity) DESC
    ) d
    ORDER BY d.rank_same DESC, d.rank_qty DESC, d.rank_city DESC, d.created_at DESC
    LIMIT GREATEST(1, LEAST(p_limit, 12))
  ) r;
  RETURN v_result;
END;
$$;

-- L'acheteur (ou un admin) d'une commande annulée côté producteur / expirée voit les alternatives.
CREATE OR REPLACE FUNCTION order_alternatives(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_order orders%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RETURN _order_error('NOT_AUTHENTICATED'); END IF;
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND OR (v_order.buyer_id <> v_uid AND NOT is_admin()) THEN RETURN _order_error('ORDER_NOT_FOUND'); END IF;
  IF v_order.status <> 'cancelled' OR v_order.cancel_reason IS NULL
     OR v_order.cancel_reason NOT IN ('confirmation_expired', 'producer_rejected', 'producer_cancelled') THEN
    RETURN jsonb_build_object('ok', true, 'eligible', false, 'alternatives', '[]'::jsonb);
  END IF;
  RETURN jsonb_build_object('ok', true, 'eligible', true, 'alternatives', _order_alternatives(p_order_id, 6));
END;
$$;

-- ============================================================
-- 9. RAPPELS + EXPIRATION (tâche serveur, rejouable)
-- ============================================================
CREATE OR REPLACE FUNCTION _order_confirmation_maintenance()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cfg order_confirmation_settings%ROWTYPE;
  o orders%ROWTYPE;
  v_start timestamptz;
  v_reminders integer := 0; v_last integer := 0; v_expired integer := 0;
  v_alt_count integer; v_buyer_body text; v_msg text;
BEGIN
  SELECT * INTO v_cfg FROM order_confirmation_settings LIMIT 1;

  -- ---- Rappels producteur (niveau 2 = rappel, niveau 3 = dernier rappel)
  FOR o IN
    SELECT * FROM orders
    WHERE status = 'pending' AND confirmation_deadline IS NOT NULL AND confirmation_deadline > now()
    ORDER BY confirmation_deadline LIMIT 500
    FOR UPDATE SKIP LOCKED
  LOOP
    v_start := o.confirmation_deadline - make_interval(secs => v_cfg.timeout_hours * 3600);
    IF now() >= o.confirmation_deadline - make_interval(secs => v_cfg.last_reminder_before_hours * 3600) THEN
      IF _notify(o.producer_id, 'order_last_reminder', 'Dernier rappel : commande à confirmer',
           'Dernier rappel : la commande ' || o.order_number || ' expirera le ' || _fmt_deadline(o.confirmation_deadline)
           || ' si vous ne la confirmez pas.', '/orders/' || o.id::text, 'last_reminder:' || o.id::text) IS NOT NULL THEN
        PERFORM _log_order_event(o.id, 'producer_reminder_sent', NULL, jsonb_build_object('level', 3, 'channel', 'in_app'), 'reminder:last');
        v_last := v_last + 1;
      END IF;
    ELSIF now() >= v_start + make_interval(secs => v_cfg.reminder_after_hours * 3600) THEN
      IF _notify(o.producer_id, 'order_reminder', 'Rappel : commande en attente',
           'Rappel : une commande attend votre confirmation (' || o.order_number || ', avant le '
           || _fmt_deadline(o.confirmation_deadline) || ').', '/orders/' || o.id::text, 'reminder:' || o.id::text) IS NOT NULL THEN
        PERFORM _log_order_event(o.id, 'producer_reminder_sent', NULL, jsonb_build_object('level', 2, 'channel', 'in_app'), 'reminder:first');
        v_reminders := v_reminders + 1;
      END IF;
    END IF;
  END LOOP;

  -- ---- Expiration (niveau 4). SKIP LOCKED + statut `pending` : un second passage n'a aucun effet.
  FOR o IN
    SELECT * FROM orders
    WHERE status = 'pending' AND confirmation_deadline IS NOT NULL AND confirmation_deadline <= now()
    ORDER BY confirmation_deadline LIMIT 200
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM set_config('app.order_rpc', 'on', true);

    UPDATE orders SET status = 'cancelled', cancel_reason = 'confirmation_expired', expired_at = now() WHERE id = o.id;
    UPDATE deliveries SET status = 'cancelled' WHERE order_id = o.id;

    -- Le stock réservé à la création est remis en vente.
    UPDATE products p SET quantity = p.quantity + i.quantity,
           status = CASE WHEN p.status = 'sold_out' THEN 'available' ELSE p.status END
    FROM order_items i WHERE i.order_id = o.id AND i.product_id = p.id;

    -- Un paiement NON encaissé est annulé ; un paiement `paid` n'est JAMAIS modifié ici
    -- (le trigger de statut crée la demande de remboursement à traiter).
    IF o.payment_status NOT IN ('paid', 'refunded') THEN
      UPDATE payments SET status = 'cancelled', cancelled_at = now() WHERE order_id = o.id AND status IN ('pending', 'processing');
      UPDATE orders SET payment_status = 'cancelled' WHERE id = o.id AND payment_status IN ('pending', 'processing');
    END IF;

    INSERT INTO order_status_history (order_id, status, changed_by, note)
    VALUES (o.id, 'cancelled', NULL, 'Expirée : le producteur n''a pas confirmé avant l''échéance');

    PERFORM _log_order_event(o.id, 'confirmation_expired', NULL,
      jsonb_build_object('deadline', o.confirmation_deadline, 'payment_status', o.payment_status), 'expired');

    v_alt_count := jsonb_array_length(_order_alternatives(o.id, 6));
    v_msg := CASE
      WHEN o.payment_status = 'paid' THEN ' Votre paiement a bien été reçu : une demande de remboursement a été enregistrée et doit être traitée par l''équipe AgriFlow (rien n''est encore remboursé).'
      WHEN o.payment_method = 'cash_on_delivery' THEN ' Aucun paiement n''a été demandé.'
      ELSE ' Aucun paiement n''a été encaissé.' END;
    v_buyer_body := 'Le producteur n''a pas confirmé votre commande ' || o.order_number || ' à temps.' || v_msg
      || CASE WHEN v_alt_count > 0 THEN ' Des alternatives disponibles vous attendent sur la page de la commande.'
              ELSE ' Aucun producteur disponible pour cette demande actuellement.' END;

    PERFORM _notify(o.buyer_id, 'order_expired', 'Commande expirée', v_buyer_body, '/orders/' || o.id::text, 'expired:buyer:' || o.id::text);
    PERFORM _log_order_event(o.id, 'buyer_notified', NULL, jsonb_build_object('channel', 'in_app', 'about', 'expired'), 'buyer_notified:expired');
    IF v_alt_count > 0 THEN
      PERFORM _log_order_event(o.id, 'alternative_offered', NULL, jsonb_build_object('count', v_alt_count), 'alternatives');
    END IF;

    PERFORM _notify(o.producer_id, 'order_expired', 'Commande expirée',
      'La commande ' || o.order_number || ' a expiré faute de confirmation avant le ' || _fmt_deadline(o.confirmation_deadline)
      || '. Le stock a été remis en vente.', '/orders/' || o.id::text, 'expired:producer:' || o.id::text);
    v_expired := v_expired + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'reminders', v_reminders, 'last_reminders', v_last, 'expired', v_expired, 'ran_at', now());
END;
$$;

-- Point d'entrée de l'Edge Function (clé service_role). pg_cron appelle directement la fonction interne.
CREATE OR REPLACE FUNCTION run_order_confirmation_maintenance()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RETURN _order_error('FORBIDDEN'); END IF;
  RETURN _order_confirmation_maintenance();
END;
$$;

-- ============================================================
-- 10. CANAL E-MAIL (optionnel) : file d'attente + journal d'envoi
-- ============================================================
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
    AND NOT EXISTS (SELECT 1 FROM notification_deliveries d WHERE d.notification_id = n.id AND d.channel = 'email')
  ORDER BY n.created_at LIMIT LEAST(p_limit, 200);
END;
$$;

CREATE OR REPLACE FUNCTION record_notification_delivery(p_notification_id uuid, p_channel text, p_provider text, p_status text, p_failure_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RETURN _order_error('FORBIDDEN'); END IF;
  IF p_channel NOT IN ('email', 'sms', 'push') OR p_status NOT IN ('sent', 'failed') THEN RETURN _order_error('INVALID_REQUEST'); END IF;
  INSERT INTO notification_deliveries (notification_id, channel, provider, status, sent_at, failure_reason)
  VALUES (p_notification_id, p_channel, p_provider, p_status, CASE WHEN p_status = 'sent' THEN now() END, left(p_failure_reason, 300))
  ON CONFLICT (notification_id, channel) DO NOTHING;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ============================================================
-- 11. payment_apply_result : le paiement ne confirme plus la commande (reprise de la fonction Passe 16)
-- ============================================================
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
-- ============================================================
-- 12. DROITS D'EXÉCUTION
-- ============================================================
-- Sur Supabase, EXECUTE est accordé par défaut à anon / authenticated : on retire explicitement.
REVOKE ALL ON FUNCTION _log_order_event(uuid, text, uuid, jsonb, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION _notify(uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION _fmt_deadline(timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION _order_confirmation_timeout() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION producer_accepting(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION _request_refund_for_cancelled_order(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION _order_alternatives(uuid, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION _order_confirmation_maintenance() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION touch_last_seen() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION touch_last_seen() TO authenticated;
REVOKE ALL ON FUNCTION set_my_availability(boolean, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_my_availability(boolean, timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION get_producer_presence(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_producer_presence(uuid[]) TO anon, authenticated;
REVOKE ALL ON FUNCTION order_alternatives(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION order_alternatives(uuid) TO authenticated;
REVOKE ALL ON FUNCTION get_order_confirmation_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_order_confirmation_settings() TO authenticated;
REVOKE ALL ON FUNCTION admin_update_order_confirmation_settings(numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_update_order_confirmation_settings(numeric, numeric, numeric) TO authenticated;

REVOKE ALL ON FUNCTION run_order_confirmation_maintenance() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION run_order_confirmation_maintenance() TO service_role;
REVOKE ALL ON FUNCTION notifications_pending_email(interval, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION notifications_pending_email(interval, integer) TO service_role;
REVOKE ALL ON FUNCTION record_notification_delivery(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_notification_delivery(uuid, text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION payment_apply_result(text, text, text, numeric, text, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION payment_apply_result(text, text, text, numeric, text, text, text, text, text, jsonb) TO service_role;

-- ============================================================
-- 13. PLANIFICATION pg_cron (uniquement si l'extension est disponible)
-- ============================================================
-- Sinon : planifier l'Edge Function `order-confirmation-cron` (voir docs/PASSE23-CONFIRMATION.md).
-- Les deux peuvent coexister : la tâche est idempotente.
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_cron;
      PERFORM cron.schedule('agriflow-order-confirmation', '*/10 * * * *', 'SELECT public._order_confirmation_maintenance()');
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'pg_cron non planifié (%). Utiliser l''Edge Function order-confirmation-cron.', SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'pg_cron indisponible : planifier l''Edge Function order-confirmation-cron.';
  END IF;
END
$cron$;
