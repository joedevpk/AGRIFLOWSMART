-- ============================================================================
-- PASSE 2 — DASHBOARD FINANCIER ET ADMINISTRATION
-- ----------------------------------------------------------------------------
-- Aucune donnée n'est créée ni modifiée par cette migration (hors journal d'actions admin).
-- Toutes les fonctions de lecture sont STABLE, SECURITY DEFINER, réservées à `is_admin()`, et agrègent
-- côté serveur (jamais de chargement de table entière dans le navigateur).
--
-- DÉFINITIONS (voir aussi docs/FINANCE-DEFINITIONS.md) — chaque indicateur est par devise, jamais additionné entre devises :
--   Volume de commandes       = nombre et valeur brute (total acheteur) des commandes CRÉÉES dans la période, hors annulées.
--                               Ce n'est PAS de l'argent encaissé.
--   Argent encaissé           = paiements RÉELS confirmés (status paid|refunded, is_demo = false) dont paid_at est dans la période.
--                               Inclut la livraison. Appartient en grande partie aux producteurs, PAS à la plateforme.
--   Remboursé                 = remboursements `completed` dont la dernière mise à jour est dans la période.
--   Commission acquise        = Σ platform_fee − Σ commission_reversed sur les commandes payées dans la période
--                               (commission_status computed|legacy). Brute : avant frais de paiement et charges.
--   Net dû aux producteurs    = SOLDE À DATE (commandes payées, règlement `pending`) : seller_amount − part remboursée nette
--                               de la commission annulée. ESTIMATION : aucun reversement n'est implémenté.
--   Bénéfice net              = NON DISPONIBLE (aucune donnée de coûts ni de frais de paiement).
--   Frais de livraison        = Σ delivery_fee des commandes non annulées (séparés ; exclus de la commission).
--   Paiements démo            = exclus de tous les indicateurs financiers, comptés à part.
-- Période = [from, to[ (début inclus, fin exclue). Jours/semaines/mois calculés en heure de Kinshasa (UTC+1).
-- ============================================================================

-- 1. INDEX adaptés aux agrégations -------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_payment_created ON orders (payment_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON payments (paid_at) WHERE paid_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refunds_completed_updated ON refunds (updated_at) WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS idx_refunds_open ON refunds (created_at) WHERE status IN ('requested', 'processing');
CREATE INDEX IF NOT EXISTS idx_financial_events_occurred ON financial_events (occurred_at DESC);

-- 2. JOURNAL DES ACTIONS ADMINISTRATIVES (ajout seul) ---------------------------------
CREATE TABLE IF NOT EXISTS admin_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,                       -- NULL = hors API (éditeur SQL / service_role)
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  reason text,
  before_state jsonb,
  after_state jsonb
);
CREATE INDEX IF NOT EXISTS idx_admin_action_log_time ON admin_action_log (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_action_log_entity ON admin_action_log (entity_type, entity_id, occurred_at DESC);
ALTER TABLE admin_action_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_action_log FROM anon, authenticated;
GRANT SELECT ON admin_action_log TO authenticated;
DROP POLICY IF EXISTS admin_action_log_admin_read ON admin_action_log;
CREATE POLICY admin_action_log_admin_read ON admin_action_log FOR SELECT TO authenticated USING (is_admin());
DROP TRIGGER IF EXISTS trg_admin_action_log_append_only ON admin_action_log;
CREATE TRIGGER trg_admin_action_log_append_only BEFORE UPDATE OR DELETE ON admin_action_log
  FOR EACH ROW EXECUTE FUNCTION _financial_append_only();
DROP TRIGGER IF EXISTS trg_admin_action_log_no_truncate ON admin_action_log;
CREATE TRIGGER trg_admin_action_log_no_truncate BEFORE TRUNCATE ON admin_action_log
  FOR EACH STATEMENT EXECUTE FUNCTION _financial_append_only();

CREATE OR REPLACE FUNCTION _admin_log(p_action text, p_type text, p_id uuid, p_before jsonb, p_after jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO admin_action_log (actor_id, action, entity_type, entity_id, reason, before_state, after_state)
  VALUES (auth.uid(), p_action, p_type, p_id, NULLIF(current_setting('app.admin_reason', true), ''), p_before, p_after);
$$;
REVOKE ALL ON FUNCTION _admin_log(text, text, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;

-- 3. RÔLES : plus de changement de rôle direct, même par un administrateur ------------------
-- (le seul chemin est admin_set_user_role : motif obligatoire, pas d'auto-modification, journalisé.)
CREATE OR REPLACE FUNCTION prevent_privilege_escalation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND auth.uid() IS NOT NULL
     AND current_setting('app.admin_rpc', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Modification du rôle non autorisée : utilisez admin_set_user_role' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT is_admin() THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Modification du rôle non autorisée';
    END IF;
    IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
      RAISE EXCEPTION 'Modification du statut de vérification non autorisée';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION admin_set_user_role(p_user_id uuid, p_role text, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old text;
BEGIN
  IF auth.uid() IS NULL OR NOT is_admin() THEN
    RAISE EXCEPTION 'Réservé aux administrateurs' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_role IS NULL OR p_role NOT IN ('producer', 'cooperative', 'buyer', 'admin') THEN RAISE EXCEPTION 'Rôle invalide'; END IF;
  IF char_length(btrim(coalesce(p_reason, ''))) < 3 OR char_length(p_reason) > 300 THEN
    RAISE EXCEPTION 'Motif obligatoire (3 à 300 caractères)';
  END IF;
  IF p_user_id = auth.uid() THEN RAISE EXCEPTION 'Vous ne pouvez pas modifier votre propre rôle'; END IF;
  SELECT role INTO v_old FROM profiles WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Utilisateur introuvable'; END IF;
  IF v_old = p_role THEN RAISE EXCEPTION 'Cet utilisateur a déjà ce rôle'; END IF;
  IF v_old = 'admin' AND (SELECT count(*) FROM profiles WHERE role = 'admin') <= 1 THEN
    RAISE EXCEPTION 'Impossible de retirer le dernier administrateur';
  END IF;
  PERFORM set_config('app.admin_rpc', 'on', true);
  PERFORM set_config('app.admin_reason', btrim(p_reason), true);
  UPDATE profiles SET role = p_role WHERE user_id = p_user_id;
  PERFORM set_config('app.admin_rpc', '', true);
  PERFORM set_config('app.admin_reason', '', true);
  RETURN jsonb_build_object('ok', true, 'role', p_role);
END;
$$;

-- 4. TRAÇABILITÉ des actions admin existantes (vérification, statut/suppression de produit) --------
CREATE OR REPLACE FUNCTION admin_trace_profiles()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    PERFORM _admin_log('profile.role_changed', 'profile', NEW.user_id, jsonb_build_object('role', OLD.role), jsonb_build_object('role', NEW.role));
  END IF;
  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
    PERFORM _admin_log('profile.verification_changed', 'profile', NEW.user_id, jsonb_build_object('is_verified', OLD.is_verified), jsonb_build_object('is_verified', NEW.is_verified));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_admin_trace_profiles ON profiles;
CREATE TRIGGER trg_admin_trace_profiles AFTER UPDATE OF role, is_verified ON profiles
  FOR EACH ROW EXECUTE FUNCTION admin_trace_profiles();

CREATE OR REPLACE FUNCTION admin_trace_products()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT is_admin() OR auth.uid() = OLD.user_id THEN
    RETURN COALESCE(NEW, OLD);   -- action du producteur lui-même : activité normale, non tracée ici
  END IF;
  IF TG_OP = 'DELETE' THEN
    PERFORM _admin_log('product.deleted_by_admin', 'product', OLD.id, jsonb_build_object('name', OLD.name, 'status', OLD.status, 'producer_id', OLD.user_id), NULL);
    RETURN OLD;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM _admin_log('product.status_changed', 'product', NEW.id, jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_admin_trace_products_upd ON products;
CREATE TRIGGER trg_admin_trace_products_upd AFTER UPDATE OF status ON products
  FOR EACH ROW EXECUTE FUNCTION admin_trace_products();
DROP TRIGGER IF EXISTS trg_admin_trace_products_del ON products;
CREATE TRIGGER trg_admin_trace_products_del BEFORE DELETE ON products
  FOR EACH ROW EXECUTE FUNCTION admin_trace_products();

-- 5. OUTILS INTERNES ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION _assert_admin() RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT is_admin() THEN
    RAISE EXCEPTION 'Réservé aux administrateurs' USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION _finance_period(p_from timestamptz, p_to timestamptz) RETURNS void LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_from IS NULL OR p_to IS NULL THEN RAISE EXCEPTION 'Période obligatoire'; END IF;
  IF p_to <= p_from THEN RAISE EXCEPTION 'La fin de période doit être postérieure au début'; END IF;
  IF p_to - p_from > interval '800 days' THEN RAISE EXCEPTION 'Période trop longue (800 jours maximum)'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION _like_escape(p text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT replace(replace(replace(p, '\', '\\'), '%', '\%'), '_', '\_');
$$;

-- 6. SYNTHÈSE ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_finance_summary(p_from timestamptz, p_to timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public SET statement_timeout = '20s' AS $$
DECLARE v_cur jsonb; v_demo bigint;
BEGIN
  PERFORM _assert_admin(); PERFORM _finance_period(p_from, p_to);

  WITH
  om AS (SELECT currency,
           count(*) FILTER (WHERE status <> 'cancelled') AS orders_count,
           COALESCE(sum(total_amount) FILTER (WHERE status <> 'cancelled'), 0) AS orders_value,
           count(*) FILTER (WHERE status = 'cancelled') AS cancelled_count,
           COALESCE(sum(total_amount) FILTER (WHERE status = 'cancelled'), 0) AS cancelled_value,
           COALESCE(sum(delivery_fee) FILTER (WHERE status <> 'cancelled'), 0) AS delivery_fees
         FROM orders WHERE created_at >= p_from AND created_at < p_to GROUP BY currency),
  pm AS (SELECT currency,
           count(*) FILTER (WHERE status IN ('pending', 'processing')) AS pending_count,
           COALESCE(sum(amount) FILTER (WHERE status IN ('pending', 'processing')), 0) AS pending_amount,
           count(*) FILTER (WHERE status IN ('failed', 'cancelled', 'expired')) AS failed_count,
           COALESCE(sum(amount) FILTER (WHERE status IN ('failed', 'cancelled', 'expired')), 0) AS failed_amount,
           count(*) FILTER (WHERE status = 'paid') AS paid_count,
           count(*) FILTER (WHERE status = 'refunded') AS refunded_full_count
         FROM payments WHERE NOT is_demo AND status <> 'demo_paid' AND created_at >= p_from AND created_at < p_to GROUP BY currency),
  cm AS (SELECT currency, count(*) AS collected_count, COALESCE(sum(amount), 0) AS collected
         FROM payments WHERE NOT is_demo AND status IN ('paid', 'refunded') AND paid_at >= p_from AND paid_at < p_to GROUP BY currency),
  rm AS (SELECT currency, count(*) AS refunded_count, COALESCE(sum(amount), 0) AS refunded
         FROM refunds WHERE status = 'completed' AND updated_at >= p_from AND updated_at < p_to GROUP BY currency),
  rp AS (SELECT currency, count(*) AS refunds_open_count, COALESCE(sum(amount), 0) AS refunds_open_amount
         FROM refunds WHERE status IN ('requested', 'processing') GROUP BY currency),
  comm AS (SELECT o.currency,
             COALESCE(sum(o.platform_fee) FILTER (WHERE o.commission_status IN ('computed', 'legacy')), 0) AS commission_gross,
             COALESCE(sum(COALESCE(o.commission_reversed, 0)) FILTER (WHERE o.commission_status IN ('computed', 'legacy')), 0) AS commission_reversed,
             count(*) FILTER (WHERE o.commission_status = 'not_configured') AS paid_without_commission
           FROM orders o JOIN payments p ON p.order_id = o.id
           WHERE NOT p.is_demo AND p.status IN ('paid', 'refunded') AND p.paid_at >= p_from AND p.paid_at < p_to GROUP BY o.currency),
  due AS (SELECT currency,
            COALESCE(sum(seller_amount - CASE WHEN refunded_amount > 0
                      THEN least(refunded_amount, COALESCE(commission_base, 0)) - COALESCE(commission_reversed, 0) ELSE 0 END)
                     FILTER (WHERE settlement_status = 'pending' AND seller_amount IS NOT NULL), 0) AS producers_due_estimate,
            count(*) FILTER (WHERE settlement_status = 'pending' AND seller_amount IS NOT NULL) AS producers_due_orders,
            count(*) FILTER (WHERE settlement_status = 'pending' AND seller_amount IS NOT NULL AND refunded_amount > 0 AND commission_reversed IS NULL) AS due_needs_arbitration,
            count(*) FILTER (WHERE settlement_status = 'on_hold') AS on_hold_orders
          FROM orders WHERE payment_status = 'paid' GROUP BY currency),
  curs AS (SELECT currency FROM om UNION SELECT currency FROM pm UNION SELECT currency FROM cm UNION SELECT currency FROM rm
           UNION SELECT currency FROM rp UNION SELECT currency FROM comm UNION SELECT currency FROM due)
  SELECT COALESCE(jsonb_object_agg(c.currency, jsonb_build_object(
      'orders_count', COALESCE(om.orders_count, 0), 'orders_value', COALESCE(om.orders_value, 0),
      'cancelled_count', COALESCE(om.cancelled_count, 0), 'cancelled_value', COALESCE(om.cancelled_value, 0),
      'delivery_fees', COALESCE(om.delivery_fees, 0),
      'payments_pending_count', COALESCE(pm.pending_count, 0), 'payments_pending_amount', COALESCE(pm.pending_amount, 0),
      'payments_failed_count', COALESCE(pm.failed_count, 0), 'payments_failed_amount', COALESCE(pm.failed_amount, 0),
      'payments_paid_count', COALESCE(pm.paid_count, 0), 'payments_refunded_full_count', COALESCE(pm.refunded_full_count, 0),
      'collected', COALESCE(cm.collected, 0), 'collected_count', COALESCE(cm.collected_count, 0),
      'refunded', COALESCE(rm.refunded, 0), 'refunded_count', COALESCE(rm.refunded_count, 0),
      'net_collected', COALESCE(cm.collected, 0) - COALESCE(rm.refunded, 0),
      'refunds_open_count', COALESCE(rp.refunds_open_count, 0), 'refunds_open_amount', COALESCE(rp.refunds_open_amount, 0),
      'commission_gross', COALESCE(comm.commission_gross, 0), 'commission_reversed', COALESCE(comm.commission_reversed, 0),
      'commission_earned', COALESCE(comm.commission_gross, 0) - COALESCE(comm.commission_reversed, 0),
      'paid_without_commission', COALESCE(comm.paid_without_commission, 0),
      'producers_due_estimate', COALESCE(due.producers_due_estimate, 0), 'producers_due_orders', COALESCE(due.producers_due_orders, 0),
      'due_needs_arbitration', COALESCE(due.due_needs_arbitration, 0), 'on_hold_orders', COALESCE(due.on_hold_orders, 0)
    )), '{}'::jsonb)
  INTO v_cur
  FROM curs c LEFT JOIN om USING (currency) LEFT JOIN pm USING (currency) LEFT JOIN cm USING (currency) LEFT JOIN rm USING (currency)
              LEFT JOIN rp USING (currency) LEFT JOIN comm USING (currency) LEFT JOIN due USING (currency);

  SELECT count(*) INTO v_demo FROM payments WHERE (is_demo OR status = 'demo_paid') AND created_at >= p_from AND created_at < p_to;

  RETURN jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to, 'timezone', 'Africa/Kinshasa'),
    'currencies', v_cur,
    'demo_payments_excluded', v_demo,
    'payouts', jsonb_build_object('available', false, 'reason', 'Aucun reversement automatisé : le net dû est une estimation, pas un versement effectué.'),
    'net_profit', jsonb_build_object('available', false, 'reason', 'Aucune donnée de coûts ni de frais de paiement : le bénéfice net ne peut pas être calculé.'),
    'payment_fees', jsonb_build_object('available', false, 'reason', 'Les frais du prestataire de paiement ne sont pas récupérés.'));
END;
$$;

-- 7. ÉVOLUTION (jour / semaine / mois, heure de Kinshasa, une devise) ----------------------------
CREATE OR REPLACE FUNCTION admin_finance_timeseries(p_from timestamptz, p_to timestamptz, p_granularity text, p_currency text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public SET statement_timeout = '20s' AS $$
DECLARE v_rows jsonb; v_step interval;
BEGIN
  PERFORM _assert_admin(); PERFORM _finance_period(p_from, p_to);
  IF p_granularity NOT IN ('day', 'week', 'month') THEN RAISE EXCEPTION 'Granularité invalide (day, week, month)'; END IF;
  IF p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'Devise obligatoire (ex. USD)'; END IF;
  v_step := ('1 ' || p_granularity)::interval;
  WITH buckets AS (
    SELECT generate_series(date_trunc(p_granularity, p_from AT TIME ZONE 'Africa/Kinshasa'),
                           date_trunc(p_granularity, (p_to - interval '1 microsecond') AT TIME ZONE 'Africa/Kinshasa'), v_step) AS b),
  o AS (SELECT date_trunc(p_granularity, created_at AT TIME ZONE 'Africa/Kinshasa') AS b, count(*) AS n, sum(total_amount) AS v
        FROM orders WHERE currency = p_currency AND status <> 'cancelled' AND created_at >= p_from AND created_at < p_to GROUP BY 1),
  c AS (SELECT date_trunc(p_granularity, paid_at AT TIME ZONE 'Africa/Kinshasa') AS b, sum(amount) AS v
        FROM payments WHERE currency = p_currency AND NOT is_demo AND status IN ('paid', 'refunded') AND paid_at >= p_from AND paid_at < p_to GROUP BY 1),
  r AS (SELECT date_trunc(p_granularity, updated_at AT TIME ZONE 'Africa/Kinshasa') AS b, sum(amount) AS v
        FROM refunds WHERE currency = p_currency AND status = 'completed' AND updated_at >= p_from AND updated_at < p_to GROUP BY 1),
  k AS (SELECT date_trunc(p_granularity, p.paid_at AT TIME ZONE 'Africa/Kinshasa') AS b,
               sum(o2.platform_fee - COALESCE(o2.commission_reversed, 0)) AS v
        FROM orders o2 JOIN payments p ON p.order_id = o2.id
        WHERE o2.currency = p_currency AND o2.commission_status IN ('computed', 'legacy') AND NOT p.is_demo
          AND p.status IN ('paid', 'refunded') AND p.paid_at >= p_from AND p.paid_at < p_to GROUP BY 1)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'bucket', to_char(buckets.b, 'YYYY-MM-DD'), 'orders_count', COALESCE(o.n, 0), 'orders_value', COALESCE(o.v, 0),
      'collected', COALESCE(c.v, 0), 'refunded', COALESCE(r.v, 0), 'commission_earned', COALESCE(k.v, 0)) ORDER BY buckets.b), '[]'::jsonb)
  INTO v_rows
  FROM buckets LEFT JOIN o USING (b) LEFT JOIN c USING (b) LEFT JOIN r USING (b) LEFT JOIN k USING (b);
  RETURN jsonb_build_object('currency', p_currency, 'granularity', p_granularity, 'timezone', 'Africa/Kinshasa', 'rows', v_rows);
END;
$$;

-- 8. RÉPARTITION (catégorie, vendeur, type de clientèle) sur les commandes PAYÉES de la période ---------
-- Catégorie : valeur des lignes (order_items) ; vendeur / clientèle : valeur produits (subtotal) + commission acquise.
-- La commission n'est pas ventilée par catégorie (non attribuable ligne par ligne sans règle approuvée).
CREATE OR REPLACE FUNCTION admin_finance_breakdown(p_from timestamptz, p_to timestamptz, p_dimension text, p_currency text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public SET statement_timeout = '20s' AS $$
DECLARE v_rows jsonb;
BEGIN
  PERFORM _assert_admin(); PERFORM _finance_period(p_from, p_to);
  IF p_dimension NOT IN ('category', 'producer', 'buyer_type') THEN RAISE EXCEPTION 'Dimension invalide'; END IF;
  IF p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'Devise obligatoire'; END IF;

  IF p_dimension = 'category' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('key', t.k, 'label', t.k, 'orders_count', t.n, 'items_value', t.v, 'commission_earned', NULL) ORDER BY t.v DESC, t.k), '[]'::jsonb)
    INTO v_rows FROM (
      SELECT COALESCE(pr.category, 'inconnue') AS k, count(DISTINCT oi.order_id) AS n, COALESCE(sum(oi.subtotal), 0) AS v
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN products pr ON pr.id = oi.product_id
      WHERE o.currency = p_currency AND EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id AND NOT p.is_demo
              AND p.status IN ('paid', 'refunded') AND p.paid_at >= p_from AND p.paid_at < p_to)
      GROUP BY 1 ORDER BY v DESC, k LIMIT 20) t;
  ELSIF p_dimension = 'producer' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('key', t.k, 'label', t.label, 'orders_count', t.n, 'items_value', t.v, 'commission_earned', t.c) ORDER BY t.v DESC, t.k), '[]'::jsonb)
    INTO v_rows FROM (
      SELECT o.producer_id::text AS k, max(COALESCE(pp.full_name, 'Producteur')) AS label, count(*) AS n,
             COALESCE(sum(COALESCE(o.subtotal, o.total_amount - o.delivery_fee)), 0) AS v,
             COALESCE(sum(o.platform_fee - COALESCE(o.commission_reversed, 0)) FILTER (WHERE o.commission_status IN ('computed', 'legacy')), 0) AS c
      FROM orders o LEFT JOIN profiles pp ON pp.user_id = o.producer_id
      WHERE o.currency = p_currency AND EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id AND NOT p.is_demo
              AND p.status IN ('paid', 'refunded') AND p.paid_at >= p_from AND p.paid_at < p_to)
      GROUP BY o.producer_id ORDER BY v DESC, k LIMIT 20) t;
  ELSE
    SELECT COALESCE(jsonb_agg(jsonb_build_object('key', t.k, 'label', t.k, 'orders_count', t.n, 'items_value', t.v, 'commission_earned', t.c) ORDER BY t.v DESC, t.k), '[]'::jsonb)
    INTO v_rows FROM (
      SELECT COALESCE(bp.buyer_type, 'non renseigné') AS k, count(*) AS n,
             COALESCE(sum(COALESCE(o.subtotal, o.total_amount - o.delivery_fee)), 0) AS v,
             COALESCE(sum(o.platform_fee - COALESCE(o.commission_reversed, 0)) FILTER (WHERE o.commission_status IN ('computed', 'legacy')), 0) AS c
      FROM orders o LEFT JOIN profiles bp ON bp.user_id = o.buyer_id
      WHERE o.currency = p_currency AND EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id AND NOT p.is_demo
              AND p.status IN ('paid', 'refunded') AND p.paid_at >= p_from AND p.paid_at < p_to)
      GROUP BY 1 ORDER BY v DESC, k LIMIT 20) t;
  END IF;
  RETURN jsonb_build_object('currency', p_currency, 'dimension', p_dimension, 'rows', v_rows, 'limit', 20);
END;
$$;

-- 9. TRANSACTIONS : filtre commun (recherche, détail, export) ---------------------------------------
-- Une ligne par commande, avec son dernier paiement. `review_reasons` = signaux à vérifier (jamais corrigés automatiquement).
-- Un paiement `pending` (jamais ouvert chez le prestataire) n'est pas une divergence ; seul `processing` > 2 h est signalé.
CREATE OR REPLACE FUNCTION _admin_tx_rows(p_q text, p_payment_status text, p_from timestamptz, p_to timestamptz,
                                         p_currency text, p_review boolean, p_order_id uuid DEFAULT NULL)
RETURNS TABLE (
  order_id uuid, order_number text, created_at timestamptz, order_status text, payment_status text,
  payment_id uuid, payment_reference text, provider_transaction_id text, payment_row_status text, payment_amount numeric, is_demo boolean,
  currency text, items_subtotal numeric, delivery_fee numeric, buyer_total numeric,
  commission_status text, platform_commission numeric, producer_net numeric, refunded_amount numeric,
  buyer_name text, producer_name text, review_reasons text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH base AS (
    SELECT o.id, o.order_number, o.created_at, o.status AS ostatus, o.payment_status AS opstatus, o.currency, o.total_amount, o.delivery_fee AS dfee,
           COALESCE(o.subtotal, o.total_amount - o.delivery_fee) AS items, o.commission_status, o.platform_fee, o.seller_amount, o.refunded_amount,
           o.buyer_id, o.producer_id,
           lp.id AS pid, lp.internal_reference, lp.provider_transaction_id, lp.status AS pstatus, lp.amount AS pamount, lp.is_demo, lp.created_at AS pcreated
    FROM orders o
    LEFT JOIN LATERAL (SELECT * FROM payments p WHERE p.order_id = o.id ORDER BY p.created_at DESC LIMIT 1) lp ON true
    WHERE (p_order_id IS NULL OR o.id = p_order_id)
      AND (p_from IS NULL OR o.created_at >= p_from) AND (p_to IS NULL OR o.created_at < p_to)
      AND (p_currency IS NULL OR o.currency = p_currency)
      AND (p_payment_status IS NULL OR o.payment_status = p_payment_status)
  ), enriched AS (
    SELECT b.*, bp.full_name AS bname, pp.full_name AS pname,
      ARRAY_REMOVE(ARRAY[
        CASE WHEN b.pstatus = 'paid' AND NOT COALESCE(b.is_demo, false) AND b.opstatus NOT IN ('paid', 'refunded') THEN 'payment_order_mismatch' END,
        CASE WHEN b.opstatus = 'paid' AND NOT EXISTS (SELECT 1 FROM payments x WHERE x.order_id = b.id AND x.status IN ('paid', 'refunded')) THEN 'order_paid_without_payment' END,
        CASE WHEN b.pstatus = 'paid' AND NOT COALESCE(b.is_demo, false) AND b.pamount <> b.total_amount THEN 'amount_mismatch' END,
        CASE WHEN b.opstatus = 'paid' AND b.commission_status = 'not_configured' THEN 'commission_not_configured' END,
        CASE WHEN b.refunded_amount <> COALESCE((SELECT sum(r.amount) FROM refunds r WHERE r.order_id = b.id AND r.status = 'completed'), 0) THEN 'refund_total_mismatch' END,
        CASE WHEN EXISTS (SELECT 1 FROM refunds r WHERE r.order_id = b.id AND r.status IN ('requested', 'processing') AND r.created_at < now() - interval '24 hours') THEN 'refund_stuck' END,
        CASE WHEN b.pstatus = 'processing' AND b.pcreated < now() - interval '2 hours' AND b.opstatus <> 'paid' THEN 'payment_stale' END
      ], NULL) AS reasons
    FROM base b LEFT JOIN profiles bp ON bp.user_id = b.buyer_id LEFT JOIN profiles pp ON pp.user_id = b.producer_id
  )
  SELECT e.id, e.order_number, e.created_at, e.ostatus, e.opstatus, e.pid, e.internal_reference, e.provider_transaction_id, e.pstatus, e.pamount, e.is_demo,
         e.currency, e.items, e.dfee, e.total_amount,
         e.commission_status, CASE WHEN e.commission_status IN ('computed', 'legacy') THEN e.platform_fee END, e.seller_amount, e.refunded_amount,
         e.bname, e.pname, e.reasons
  FROM enriched e
  WHERE (NOT COALESCE(p_review, false) OR cardinality(e.reasons) > 0)
    AND (p_q IS NULL OR p_q = ''
         OR e.order_number ILIKE '%' || _like_escape(p_q) || '%' ESCAPE '\'
         OR e.internal_reference ILIKE '%' || _like_escape(p_q) || '%' ESCAPE '\'
         OR e.provider_transaction_id = p_q
         OR e.bname ILIKE '%' || _like_escape(p_q) || '%' ESCAPE '\'
         OR e.pname ILIKE '%' || _like_escape(p_q) || '%' ESCAPE '\');
$$;
REVOKE ALL ON FUNCTION _admin_tx_rows(text, text, timestamptz, timestamptz, text, boolean, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION admin_transactions_search(
  p_q text DEFAULT NULL, p_payment_status text DEFAULT NULL, p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL,
  p_currency text DEFAULT NULL, p_review boolean DEFAULT false, p_page integer DEFAULT 1, p_page_size integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public SET statement_timeout = '20s' AS $$
DECLARE v_ps int; v_page int; v_q text; v_total bigint; v_rows jsonb;
BEGIN
  PERFORM _assert_admin();
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_to <= p_from THEN RAISE EXCEPTION 'La fin de période doit être postérieure au début'; END IF;
  v_ps := least(greatest(COALESCE(p_page_size, 25), 1), 100);
  v_page := least(greatest(COALESCE(p_page, 1), 1), 10000);
  v_q := NULLIF(left(btrim(COALESCE(p_q, '')), 100), '');
  IF v_q IS NOT NULL AND char_length(v_q) < 2 THEN RAISE EXCEPTION 'Saisissez au moins 2 caractères'; END IF;
  SELECT count(*) INTO v_total FROM _admin_tx_rows(v_q, p_payment_status, p_from, p_to, p_currency, p_review);
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC, t.order_id), '[]'::jsonb) INTO v_rows FROM (
    SELECT * FROM _admin_tx_rows(v_q, p_payment_status, p_from, p_to, p_currency, p_review)
    ORDER BY created_at DESC, order_id LIMIT v_ps OFFSET (v_page - 1) * v_ps) t;
  RETURN jsonb_build_object('rows', v_rows, 'total', v_total, 'page', v_page, 'page_size', v_ps);
END;
$$;

-- Export : mêmes droits et mêmes filtres que la recherche, 5 000 lignes maximum, journalisé (filtres + nombre de lignes, jamais le contenu).
CREATE OR REPLACE FUNCTION admin_transactions_export(
  p_q text DEFAULT NULL, p_payment_status text DEFAULT NULL, p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL,
  p_currency text DEFAULT NULL, p_review boolean DEFAULT false, p_limit integer DEFAULT 5000)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public SET statement_timeout = '30s' AS $$
DECLARE v_limit int; v_q text; v_rows jsonb; v_n int;
BEGIN
  PERFORM _assert_admin();
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_to <= p_from THEN RAISE EXCEPTION 'La fin de période doit être postérieure au début'; END IF;
  v_limit := least(greatest(COALESCE(p_limit, 5000), 1), 5000);
  v_q := NULLIF(left(btrim(COALESCE(p_q, '')), 100), '');
  IF v_q IS NOT NULL AND char_length(v_q) < 2 THEN RAISE EXCEPTION 'Saisissez au moins 2 caractères'; END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(t) - 'order_id' ORDER BY t.created_at DESC, t.order_id), '[]'::jsonb), count(*) INTO v_rows, v_n FROM (
    SELECT order_id, order_number, created_at, order_status, payment_status, payment_reference, provider_transaction_id, currency,
           items_subtotal, delivery_fee, buyer_total, commission_status, platform_commission, producer_net, refunded_amount, review_reasons
    FROM _admin_tx_rows(v_q, p_payment_status, p_from, p_to, p_currency, p_review)
    ORDER BY created_at DESC, order_id LIMIT v_limit + 1) t;
  PERFORM _financial_audit('export.transactions', 'export', NULL, NULL,
    jsonb_build_object('row_count', least(v_n, v_limit), 'truncated', v_n > v_limit, 'q_present', v_q IS NOT NULL,
      'payment_status', p_payment_status, 'from', p_from, 'to', p_to, 'currency', p_currency, 'review_only', COALESCE(p_review, false)));
  IF v_n > v_limit THEN v_rows := v_rows - v_limit; END IF;
  RETURN jsonb_build_object('rows', v_rows, 'row_count', least(v_n, v_limit), 'truncated', v_n > v_limit, 'limit', v_limit);
END;
$$;

-- Détail d'une transaction (sans numéro de téléphone ni charge brute du prestataire).
CREATE OR REPLACE FUNCTION admin_transaction_detail(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tx jsonb;
BEGIN
  PERFORM _assert_admin();
  SELECT to_jsonb(t) INTO v_tx FROM _admin_tx_rows(NULL, NULL, NULL, NULL, NULL, false, p_order_id) t LIMIT 1;
  IF v_tx IS NULL THEN RAISE EXCEPTION 'Commande introuvable'; END IF;
  RETURN jsonb_build_object(
    'transaction', v_tx,
    'order', (SELECT jsonb_build_object('commission_rate_bps', commission_rate_bps, 'commission_base', commission_base, 'commission_rule_id', commission_rule_id,
                'commission_refund_policy', commission_refund_policy, 'commission_reversed', commission_reversed, 'settlement_status', settlement_status)
              FROM orders WHERE id = p_order_id),
    'payments', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'internal_reference', internal_reference, 'provider_transaction_id', provider_transaction_id,
                'status', status, 'provider_status', provider_status, 'amount', amount, 'currency', currency, 'method', method, 'provider', provider,
                'is_demo', is_demo, 'created_at', created_at, 'paid_at', paid_at, 'failed_at', failed_at, 'refunded_at', refunded_at, 'failure_reason', failure_reason)
                ORDER BY created_at), '[]'::jsonb) FROM payments WHERE order_id = p_order_id),
    'payment_events', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', e.id, 'payment_id', e.payment_id, 'event_type', e.event_type, 'provider_status', e.provider_status,
                'amount', e.amount, 'currency', e.currency, 'processed', e.processed, 'result_code', e.result_code, 'created_at', e.created_at) ORDER BY e.created_at), '[]'::jsonb)
                FROM payment_events e JOIN payments p ON p.id = e.payment_id WHERE p.order_id = p_order_id),
    'refunds', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'amount', amount, 'currency', currency, 'status', status, 'reason', reason,
                'created_at', created_at, 'updated_at', updated_at) ORDER BY created_at), '[]'::jsonb) FROM refunds WHERE order_id = p_order_id),
    'financial_events', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'occurred_at', occurred_at, 'event_type', event_type, 'amount', amount, 'currency', currency)
                ORDER BY occurred_at), '[]'::jsonb) FROM financial_events WHERE order_id = p_order_id));
END;
$$;

-- 10. RAPPROCHEMENT (lecture seule : signale, ne corrige JAMAIS) ----------------------------------------
CREATE OR REPLACE FUNCTION admin_reconciliation_report(p_from timestamptz, p_to timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public SET statement_timeout = '30s' AS $$
DECLARE v_res jsonb; v_cut timestamptz;
BEGIN
  PERFORM _assert_admin(); PERFORM _finance_period(p_from, p_to);
  SELECT min(occurred_at) INTO v_cut FROM financial_events;
  WITH recon (kind, severity, order_id, payment_id, refund_id, expected, actual, currency, detail) AS (
  SELECT 'payment_confirmed_order_not_paid'::text, 'error'::text, o.id, p.id, NULL::uuid, NULL::numeric, NULL::numeric, o.currency::text, 'Paiement confirmé mais commande en statut ' || o.payment_status
    FROM payments p JOIN orders o ON o.id = p.order_id
    WHERE NOT p.is_demo AND p.status = 'paid' AND o.payment_status NOT IN ('paid', 'refunded') AND p.paid_at >= p_from AND p.paid_at < p_to
  UNION ALL
  SELECT 'order_paid_without_payment', 'error', o.id, NULL, NULL, o.total_amount, 0, o.currency, 'Commande marquée payée sans paiement confirmé'
    FROM orders o WHERE o.payment_status = 'paid' AND o.created_at >= p_from AND o.created_at < p_to
      AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id AND p.status IN ('paid', 'refunded'))
  UNION ALL
  SELECT 'amount_mismatch', 'error', o.id, p.id, NULL, o.total_amount, p.amount, o.currency, 'Montant payé différent du total de la commande'
    FROM payments p JOIN orders o ON o.id = p.order_id
    WHERE NOT p.is_demo AND p.status IN ('paid', 'refunded') AND p.amount <> o.total_amount AND p.paid_at >= p_from AND p.paid_at < p_to
  UNION ALL
  SELECT 'currency_mismatch', 'error', o.id, p.id, NULL, NULL, NULL, o.currency, 'Devise du paiement (' || p.currency || ') différente de la commande (' || o.currency || ')'
    FROM payments p JOIN orders o ON o.id = p.order_id
    WHERE NOT p.is_demo AND p.status IN ('paid', 'refunded') AND p.currency <> o.currency AND p.paid_at >= p_from AND p.paid_at < p_to
  UNION ALL
  SELECT 'commission_mismatch', 'error', o.id, NULL, NULL, _commission_amount(o.commission_base, o.commission_rate_bps), o.platform_fee, o.currency,
         'Commission enregistrée différente de la formule appliquée au taux figé'
    FROM orders o WHERE o.commission_status = 'computed' AND o.created_at >= p_from AND o.created_at < p_to
      AND o.platform_fee <> _commission_amount(o.commission_base, o.commission_rate_bps)
  UNION ALL
  SELECT 'net_mismatch', 'error', o.id, NULL, NULL, o.commission_base - o.platform_fee, o.seller_amount, o.currency, 'Net producteur différent de produits − commission'
    FROM orders o WHERE o.commission_status = 'computed' AND o.payment_status IN ('paid', 'refunded') AND o.created_at >= p_from AND o.created_at < p_to
      AND o.seller_amount IS DISTINCT FROM (o.commission_base - o.platform_fee)
  UNION ALL
  SELECT 'refund_total_mismatch', 'error', o.id, NULL, NULL,
         COALESCE((SELECT sum(r.amount) FROM refunds r WHERE r.order_id = o.id AND r.status = 'completed'), 0), o.refunded_amount, o.currency,
         'Cumul remboursé de la commande différent des remboursements complétés'
    FROM orders o WHERE o.created_at >= p_from AND o.created_at < p_to
      AND o.refunded_amount <> COALESCE((SELECT sum(r.amount) FROM refunds r WHERE r.order_id = o.id AND r.status = 'completed'), 0)
  UNION ALL
  SELECT 'missing_ledger_event', 'error', o.id, p.id, NULL, NULL, NULL, o.currency, 'Paiement confirmé sans événement comptable payment_confirmed'
    FROM payments p JOIN orders o ON o.id = p.order_id
    WHERE v_cut IS NOT NULL AND NOT p.is_demo AND p.status IN ('paid', 'refunded') AND p.paid_at >= GREATEST(p_from, v_cut) AND p.paid_at < p_to
      AND NOT EXISTS (SELECT 1 FROM financial_events e WHERE e.idempotency_key = 'payment_confirmed:' || p.id::text)
  UNION ALL
  SELECT 'refund_stuck', 'warning', r.order_id, r.payment_id, r.id, r.amount, NULL, r.currency, 'Remboursement ' || r.status || ' depuis plus de 24 h : à vérifier auprès du prestataire'
    FROM refunds r WHERE r.status IN ('requested', 'processing') AND r.created_at < now() - interval '24 hours'
  UNION ALL
  SELECT 'payment_stale', 'warning', p.order_id, p.id, NULL, p.amount, NULL, p.currency, 'Paiement en cours de confirmation depuis plus de 2 h : statut à confirmer auprès du prestataire'
    FROM payments p JOIN orders o ON o.id = p.order_id
    WHERE NOT p.is_demo AND p.status = 'processing' AND p.created_at < now() - interval '2 hours' AND o.payment_status <> 'paid'
      AND p.created_at >= p_from AND p.created_at < p_to
  UNION ALL
  SELECT 'paid_without_commission_rule', 'info', o.id, NULL, NULL, NULL, NULL, o.currency, 'Commande payée sans règle de commission approuvée : règlement en attente de décision'
    FROM orders o WHERE o.payment_status = 'paid' AND o.commission_status = 'not_configured' AND o.created_at >= p_from AND o.created_at < p_to
  ), tot AS (SELECT kind, count(*) AS n FROM recon GROUP BY kind),
  it AS (SELECT * FROM recon ORDER BY CASE severity WHEN 'error' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, kind, order_id LIMIT 500),
  cnt AS (SELECT count(*) FILTER (WHERE severity = 'error') AS e, count(*) FILTER (WHERE severity = 'warning') AS w,
                 count(*) FILTER (WHERE severity = 'info') AS i, count(*) AS total FROM recon)
  SELECT jsonb_build_object('totals', (SELECT COALESCE(jsonb_object_agg(kind, n), '{}'::jsonb) FROM tot),
           'items', (SELECT COALESCE(jsonb_agg(to_jsonb(it)), '[]'::jsonb) FROM it),
           'errors', cnt.e, 'warnings', cnt.w, 'infos', cnt.i, 'truncated', cnt.total > 500)
  INTO v_res FROM cnt;
  RETURN v_res || jsonb_build_object(
    'generated_at', now(), 'period', jsonb_build_object('from', p_from, 'to', p_to),
    'payouts', jsonb_build_object('available', false, 'reason', 'Aucun reversement implémenté : le rapprochement des reversements n''est pas disponible.'),
    'corrections', 'Aucune : ce rapport est en lecture seule.');
END;
$$;

-- 11. DROITS -----------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION _assert_admin(), _finance_period(timestamptz, timestamptz), _like_escape(text),
  admin_trace_profiles(), admin_trace_products() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION admin_set_user_role(uuid, text, text), admin_finance_summary(timestamptz, timestamptz),
  admin_finance_timeseries(timestamptz, timestamptz, text, text), admin_finance_breakdown(timestamptz, timestamptz, text, text),
  admin_transactions_search(text, text, timestamptz, timestamptz, text, boolean, integer, integer),
  admin_transactions_export(text, text, timestamptz, timestamptz, text, boolean, integer),
  admin_transaction_detail(uuid), admin_reconciliation_report(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_set_user_role(uuid, text, text), admin_finance_summary(timestamptz, timestamptz),
  admin_finance_timeseries(timestamptz, timestamptz, text, text), admin_finance_breakdown(timestamptz, timestamptz, text, text),
  admin_transactions_search(text, text, timestamptz, timestamptz, text, boolean, integer, integer),
  admin_transactions_export(text, text, timestamptz, timestamptz, text, boolean, integer),
  admin_transaction_detail(uuid), admin_reconciliation_report(timestamptz, timestamptz) TO authenticated;
