-- ============================================================================
-- PASSE 1 — MODÈLE ÉCONOMIQUE ET MOTEUR DE COMMISSIONS
-- ----------------------------------------------------------------------------
-- Principes :
--   * AUCUN taux n'est fixé ni activé par cette migration. Tant qu'un administrateur n'a pas
--     créé PUIS approuvé (avec référence de validation commerciale) une règle, les nouvelles
--     commandes sont `commission_status = 'not_configured'` : commission = 0, aucun net inventé,
--     règlement `on_hold`. Le paiement de l'acheteur n'est jamais bloqué.
--   * La règle applicable est FIGÉE sur la commande à sa création (trigger BEFORE INSERT) :
--     un changement de taux ultérieur ne modifie jamais une commande existante.
--   * Calcul serveur uniquement, en arithmétique exacte (numeric + taux en points de base entiers),
--     arrondi au centième, demi vers le haut. Assiette = montant des produits (hors livraison).
--   * L'ancien calcul (payment_settings.commission_value, repli à 5 %) n'est PLUS utilisé.
--   * Journal comptable (financial_events) et journal d'audit (financial_audit_log) en ajout seul.
-- Compatibilité : additive. Aucune donnée supprimée, aucune migration antérieure modifiée.
-- ============================================================================

-- 1. RÈGLES DE COMMISSION (versionnées) ---------------------------------------
CREATE TABLE IF NOT EXISTS commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Extensible (catégorie / producteur) mais volontairement verrouillé sur 'global' en V1 :
  -- aucune règle spécifique ne peut être activée prématurément.
  scope text NOT NULL DEFAULT 'global' CHECK (scope = 'global'),
  category text,
  producer_id uuid,
  rate_bps integer NOT NULL CHECK (rate_bps BETWEEN 0 AND 10000),
  -- Frais fixes par commande : prévus pour plus tard, non appliqués en V1 (forcés à 0).
  fixed_fee numeric NOT NULL DEFAULT 0 CHECK (fixed_fee = 0),
  base_policy text NOT NULL DEFAULT 'items_subtotal' CHECK (base_policy IN ('items_subtotal')),
  -- NULL = règle de remboursement NON DÉCIDÉE (décision commerciale à valider).
  refund_commission_policy text CHECK (refund_commission_policy IN ('proportional', 'keep_all')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'retired')),
  effective_from timestamptz,
  validation_reference text,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  retired_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  retired_at timestamptz,
  retire_reason text,
  CONSTRAINT commission_rules_approved_complete CHECK (
    status = 'draft' OR (effective_from IS NOT NULL AND approved_by IS NOT NULL AND approved_at IS NOT NULL
                         AND char_length(btrim(coalesce(validation_reference, ''))) >= 3)
  )
);
CREATE INDEX IF NOT EXISTS idx_commission_rules_active ON commission_rules (effective_from DESC) WHERE status = 'approved';

-- 2. JOURNAUX EN AJOUT SEUL ----------------------------------------------------
CREATE TABLE IF NOT EXISTS financial_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  before_state jsonb,
  after_state jsonb
);
CREATE INDEX IF NOT EXISTS idx_financial_audit_entity ON financial_audit_log (entity_type, entity_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS financial_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  payment_id uuid REFERENCES payments(id) ON DELETE RESTRICT,
  refund_id uuid REFERENCES refunds(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN (
    'commission_snapshot', 'payment_confirmed',
    'refund_requested', 'refund_processing', 'refund_completed', 'refund_failed')),
  amount numeric,
  currency text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_financial_events_order ON financial_events (order_id, occurred_at);

CREATE OR REPLACE FUNCTION _financial_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Journal financier en ajout seul : % interdit sur %', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
DROP TRIGGER IF EXISTS trg_financial_audit_append_only ON financial_audit_log;
CREATE TRIGGER trg_financial_audit_append_only BEFORE UPDATE OR DELETE ON financial_audit_log
  FOR EACH ROW EXECUTE FUNCTION _financial_append_only();
DROP TRIGGER IF EXISTS trg_financial_audit_no_truncate ON financial_audit_log;
CREATE TRIGGER trg_financial_audit_no_truncate BEFORE TRUNCATE ON financial_audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION _financial_append_only();
DROP TRIGGER IF EXISTS trg_financial_events_append_only ON financial_events;
CREATE TRIGGER trg_financial_events_append_only BEFORE UPDATE OR DELETE ON financial_events
  FOR EACH ROW EXECUTE FUNCTION _financial_append_only();
DROP TRIGGER IF EXISTS trg_financial_events_no_truncate ON financial_events;
CREATE TRIGGER trg_financial_events_no_truncate BEFORE TRUNCATE ON financial_events
  FOR EACH STATEMENT EXECUTE FUNCTION _financial_append_only();

-- 3. RLS : lecture réservée aux administrateurs, aucune écriture directe -----------
ALTER TABLE commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON commission_rules, financial_audit_log, financial_events FROM anon, authenticated;
GRANT SELECT ON commission_rules, financial_audit_log, financial_events TO authenticated;
DROP POLICY IF EXISTS commission_rules_admin_read ON commission_rules;
CREATE POLICY commission_rules_admin_read ON commission_rules FOR SELECT TO authenticated USING (is_admin());
DROP POLICY IF EXISTS financial_audit_admin_read ON financial_audit_log;
CREATE POLICY financial_audit_admin_read ON financial_audit_log FOR SELECT TO authenticated USING (is_admin());
DROP POLICY IF EXISTS financial_events_admin_read ON financial_events;
CREATE POLICY financial_events_admin_read ON financial_events FOR SELECT TO authenticated USING (is_admin());

-- 4. COLONNES D'INSTANTANÉ SUR LES COMMANDES (platform_fee / seller_amount existent déjà) -------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_status text NOT NULL DEFAULT 'not_configured';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_rule_id uuid REFERENCES commission_rules(id) ON DELETE RESTRICT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_rate_bps integer;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_base numeric;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_refund_policy text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_computed_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_reversed numeric;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_commission_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_commission_status_check
  CHECK (commission_status IN ('computed', 'not_configured', 'legacy'));
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_refunded_amount_check;
ALTER TABLE orders ADD CONSTRAINT orders_refunded_amount_check
  CHECK (refunded_amount >= 0 AND refunded_amount <= total_amount) NOT VALID;

-- Commandes déjà payées avant la passe 1 : calculées avec l'ancienne méthode (taux inconnu) → `legacy`.
-- Leurs montants ne sont JAMAIS recalculés. Les autres restent `not_configured`.
UPDATE orders SET commission_status = 'legacy'
 WHERE payment_status IN ('paid', 'demo_paid', 'refunded') AND commission_status = 'not_configured';

-- 5. CALCUL (exact, déterministe) -----------------------------------------------
CREATE OR REPLACE FUNCTION _commission_amount(p_base numeric, p_rate_bps integer)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_base IS NULL OR p_base < 0 THEN RAISE EXCEPTION 'Assiette de commission invalide'; END IF;
  IF p_rate_bps IS NULL OR p_rate_bps < 0 OR p_rate_bps > 10000 THEN RAISE EXCEPTION 'Taux de commission invalide'; END IF;
  -- numeric exact ; arrondi au centième, demi vers le haut (montants positifs).
  RETURN round(p_base * p_rate_bps / 10000, 2);
END;
$$;

CREATE OR REPLACE FUNCTION _active_commission_rule(p_at timestamptz DEFAULT now())
RETURNS commission_rules LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM commission_rules
  WHERE status = 'approved' AND effective_from <= p_at
  ORDER BY effective_from DESC, approved_at DESC
  LIMIT 1;
$$;

-- 6. INSTANTANÉ À LA CRÉATION DE LA COMMANDE ---------------------------------------
CREATE OR REPLACE FUNCTION orders_commission_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rule commission_rules;
  v_base numeric;
BEGIN
  -- Le client ne peut jamais imposer taux, commission ou net : tout est écrasé ici.
  v_base := COALESCE(NEW.subtotal, NEW.total_amount - COALESCE(NEW.delivery_fee, 0));
  NEW.seller_amount := NULL;
  NEW.refunded_amount := 0;
  NEW.commission_reversed := NULL;
  SELECT * INTO v_rule FROM _active_commission_rule(now());
  IF v_rule.id IS NULL THEN
    NEW.commission_status := 'not_configured';
    NEW.commission_rule_id := NULL; NEW.commission_rate_bps := NULL; NEW.commission_base := v_base;
    NEW.commission_refund_policy := NULL; NEW.platform_fee := 0; NEW.commission_computed_at := NULL;
  ELSE
    NEW.commission_status := 'computed';
    NEW.commission_rule_id := v_rule.id;
    NEW.commission_rate_bps := v_rule.rate_bps;
    NEW.commission_base := v_base;
    NEW.commission_refund_policy := v_rule.refund_commission_policy;
    NEW.platform_fee := _commission_amount(v_base, v_rule.rate_bps);
    NEW.commission_computed_at := now();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_orders_00_commission_snapshot ON orders;
CREATE TRIGGER trg_orders_00_commission_snapshot BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_commission_snapshot();

CREATE OR REPLACE FUNCTION orders_commission_snapshot_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO financial_events (order_id, event_type, amount, currency, details, idempotency_key)
  VALUES (NEW.id, 'commission_snapshot', NEW.platform_fee, NEW.currency,
    jsonb_build_object('commission_status', NEW.commission_status, 'rule_id', NEW.commission_rule_id,
      'rate_bps', NEW.commission_rate_bps, 'base', NEW.commission_base, 'delivery_fee', NEW.delivery_fee,
      'refund_policy', NEW.commission_refund_policy),
    'snapshot:' || NEW.id::text)
  ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_orders_commission_snapshot_event ON orders;
CREATE TRIGGER trg_orders_commission_snapshot_event AFTER INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_commission_snapshot_event();

-- 7. GARDE-FOUS : champs financiers non modifiables hors chemin serveur --------------------
-- (même un administrateur ne peut pas réécrire directement une commission : passer par les RPC.)
CREATE OR REPLACE FUNCTION protect_commission_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('app.order_rpc', true) = 'on' THEN RETURN NEW; END IF;
  IF NEW.platform_fee IS DISTINCT FROM OLD.platform_fee
     OR NEW.seller_amount IS DISTINCT FROM OLD.seller_amount
     OR NEW.settlement_status IS DISTINCT FROM OLD.settlement_status
     OR NEW.commission_status IS DISTINCT FROM OLD.commission_status
     OR NEW.commission_rule_id IS DISTINCT FROM OLD.commission_rule_id
     OR NEW.commission_rate_bps IS DISTINCT FROM OLD.commission_rate_bps
     OR NEW.commission_base IS DISTINCT FROM OLD.commission_base
     OR NEW.commission_refund_policy IS DISTINCT FROM OLD.commission_refund_policy
     OR NEW.commission_computed_at IS DISTINCT FROM OLD.commission_computed_at
     OR NEW.refunded_amount IS DISTINCT FROM OLD.refunded_amount
     OR NEW.commission_reversed IS DISTINCT FROM OLD.commission_reversed THEN
    RAISE EXCEPTION 'Les montants financiers de la commande ne sont modifiables que par le serveur'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_orders_protect_commission ON orders;
CREATE TRIGGER trg_orders_protect_commission BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION protect_commission_fields();

-- 8. JOURNAL D'AUDIT + RPC D'ADMINISTRATION DES RÈGLES -------------------------------------
CREATE OR REPLACE FUNCTION _financial_audit(p_action text, p_type text, p_id uuid, p_before jsonb, p_after jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO financial_audit_log (actor_id, action, entity_type, entity_id, before_state, after_state)
  VALUES (auth.uid(), p_action, p_type, p_id, p_before, p_after);
$$;
REVOKE ALL ON FUNCTION _financial_audit(text, text, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;

-- Crée un BROUILLON : n'affecte aucune commande tant qu'il n'est pas approuvé.
CREATE OR REPLACE FUNCTION admin_create_commission_rule(p_rate_bps integer, p_refund_policy text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT is_admin() THEN
    RAISE EXCEPTION 'Réservé aux administrateurs' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_rate_bps IS NULL OR p_rate_bps < 0 OR p_rate_bps > 10000 THEN
    RAISE EXCEPTION 'Taux invalide : entier entre 0 et 10000 points de base (100 pb = 1 %%)';
  END IF;
  IF p_refund_policy IS NOT NULL AND p_refund_policy NOT IN ('proportional', 'keep_all') THEN
    RAISE EXCEPTION 'Politique de remboursement invalide';
  END IF;
  IF p_note IS NOT NULL AND char_length(p_note) > 500 THEN RAISE EXCEPTION 'Note trop longue'; END IF;
  INSERT INTO commission_rules (rate_bps, refund_commission_policy, note, created_by, status)
  VALUES (p_rate_bps, p_refund_policy, NULLIF(btrim(p_note), ''), auth.uid(), 'draft')
  RETURNING id INTO v_id;
  PERFORM _financial_audit('commission_rule.created', 'commission_rule', v_id, NULL,
    jsonb_build_object('rate_bps', p_rate_bps, 'refund_policy', p_refund_policy, 'status', 'draft'));
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

-- Approuve un brouillon après validation commerciale (référence obligatoire, pas d'antidatage).
CREATE OR REPLACE FUNCTION admin_approve_commission_rule(p_rule_id uuid, p_validation_reference text, p_effective_from timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rule commission_rules; v_eff timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT is_admin() THEN
    RAISE EXCEPTION 'Réservé aux administrateurs' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF char_length(btrim(coalesce(p_validation_reference, ''))) < 3 OR char_length(p_validation_reference) > 200 THEN
    RAISE EXCEPTION 'Référence de validation commerciale obligatoire (3 à 200 caractères)';
  END IF;
  SELECT * INTO v_rule FROM commission_rules WHERE id = p_rule_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Règle introuvable'; END IF;
  IF v_rule.status <> 'draft' THEN RAISE EXCEPTION 'Seul un brouillon peut être approuvé (statut actuel : %)', v_rule.status; END IF;
  v_eff := COALESCE(p_effective_from, now());
  IF v_eff < now() - interval '5 minutes' THEN
    RAISE EXCEPTION 'La date d''effet ne peut pas être antérieure à maintenant (pas d''antidatage)';
  END IF;
  UPDATE commission_rules SET status = 'approved', effective_from = v_eff, approved_by = auth.uid(),
         approved_at = now(), validation_reference = btrim(p_validation_reference)
   WHERE id = p_rule_id;
  PERFORM _financial_audit('commission_rule.approved', 'commission_rule', p_rule_id,
    jsonb_build_object('status', 'draft'),
    jsonb_build_object('status', 'approved', 'rate_bps', v_rule.rate_bps, 'effective_from', v_eff,
                       'validation_reference', btrim(p_validation_reference),
                       'refund_policy', v_rule.refund_commission_policy));
  RETURN jsonb_build_object('ok', true, 'effective_from', v_eff);
END;
$$;

-- Retire une règle (brouillon ou approuvée). Si aucune autre règle approuvée n'est effective,
-- les nouvelles commandes redeviennent `not_configured` (état sûr). Les commandes existantes ne changent pas.
CREATE OR REPLACE FUNCTION admin_retire_commission_rule(p_rule_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rule commission_rules;
BEGIN
  IF auth.uid() IS NULL OR NOT is_admin() THEN
    RAISE EXCEPTION 'Réservé aux administrateurs' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF char_length(btrim(coalesce(p_reason, ''))) < 3 OR char_length(p_reason) > 300 THEN
    RAISE EXCEPTION 'Motif obligatoire (3 à 300 caractères)';
  END IF;
  SELECT * INTO v_rule FROM commission_rules WHERE id = p_rule_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Règle introuvable'; END IF;
  IF v_rule.status = 'retired' THEN RAISE EXCEPTION 'Règle déjà retirée'; END IF;
  UPDATE commission_rules SET status = 'retired', retired_by = auth.uid(), retired_at = now(), retire_reason = btrim(p_reason)
   WHERE id = p_rule_id;
  PERFORM _financial_audit('commission_rule.retired', 'commission_rule', p_rule_id,
    jsonb_build_object('status', v_rule.status), jsonb_build_object('status', 'retired', 'reason', btrim(p_reason)));
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Synthèse pour l'écran d'administration.
CREATE OR REPLACE FUNCTION admin_commission_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rule commission_rules;
BEGIN
  IF auth.uid() IS NULL OR NOT is_admin() THEN
    RAISE EXCEPTION 'Réservé aux administrateurs' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_rule FROM _active_commission_rule(now());
  RETURN jsonb_build_object(
    'configured', v_rule.id IS NOT NULL,
    'active_rule', CASE WHEN v_rule.id IS NULL THEN NULL ELSE to_jsonb(v_rule) END,
    'drafts', (SELECT count(*) FROM commission_rules WHERE status = 'draft'),
    'orders_computed', (SELECT count(*) FROM orders WHERE commission_status = 'computed'),
    'orders_not_configured', (SELECT count(*) FROM orders WHERE commission_status = 'not_configured'),
    'orders_legacy', (SELECT count(*) FROM orders WHERE commission_status = 'legacy'));
END;
$$;

REVOKE ALL ON FUNCTION admin_create_commission_rule(integer, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION admin_approve_commission_rule(uuid, text, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION admin_retire_commission_rule(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION admin_commission_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_create_commission_rule(integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_approve_commission_rule(uuid, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_retire_commission_rule(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_commission_overview() TO authenticated;
REVOKE ALL ON FUNCTION _commission_amount(numeric, integer), _active_commission_rule(timestamptz),
  orders_commission_snapshot(), orders_commission_snapshot_event(), protect_commission_fields() FROM PUBLIC, anon, authenticated;

-- 9. REMBOURSEMENTS : journal comptable + cumul sur la commande -----------------------------
CREATE OR REPLACE FUNCTION refunds_financial_ledger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_refunded numeric;
  v_reversed numeric;
  v_prev text;
BEGIN
  INSERT INTO financial_events (order_id, payment_id, refund_id, event_type, amount, currency, details, idempotency_key)
  VALUES (NEW.order_id, NEW.payment_id, NEW.id, 'refund_' || NEW.status, NEW.amount, NEW.currency,
          jsonb_build_object('reason', NEW.reason, 'provider_reference', NEW.provider_reference),
          'refund:' || NEW.id::text || ':' || NEW.status)
  ON CONFLICT (idempotency_key) DO NOTHING;

  -- Un remboursement n'est réputé réussi QUE lorsque son statut est `completed` (confirmé par
  -- le traitement du prestataire / de l'administrateur) ; jamais sur simple demande.
  IF NEW.status = 'completed' THEN
    SELECT * INTO v_order FROM orders WHERE id = NEW.order_id FOR UPDATE;
    SELECT COALESCE(sum(amount), 0) INTO v_refunded FROM refunds WHERE order_id = NEW.order_id AND status = 'completed';
    v_reversed := CASE
      WHEN v_order.commission_status <> 'computed' THEN NULL
      WHEN v_order.commission_refund_policy = 'keep_all' THEN 0
      WHEN v_order.commission_refund_policy = 'proportional' AND v_order.commission_base > 0
        THEN round(v_order.platform_fee * least(v_refunded, v_order.commission_base) / v_order.commission_base, 2)
      WHEN v_order.commission_refund_policy = 'proportional' THEN 0
      ELSE NULL END;                      -- politique non décidée : à arbitrer, rien d'inventé
    v_prev := current_setting('app.order_rpc', true);
    PERFORM set_config('app.order_rpc', 'on', true);
    UPDATE orders SET refunded_amount = v_refunded, commission_reversed = v_reversed WHERE id = NEW.order_id;
    PERFORM set_config('app.order_rpc', COALESCE(v_prev, ''), true);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION refunds_financial_ledger() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_refunds_financial_ledger ON refunds;
CREATE TRIGGER trg_refunds_financial_ledger AFTER INSERT OR UPDATE OF status ON refunds
  FOR EACH ROW EXECUTE FUNCTION refunds_financial_ledger();

-- 10. VUE FINANCIÈRE (respecte la RLS de `orders` ; commission masquée à l'acheteur) -----------
-- `payment_fee` n'existe pas : CinetPay ne renvoie pas de frais dans le flux actuel. Rien n'est inventé.
CREATE OR REPLACE VIEW order_financials WITH (security_invoker = true) AS
SELECT
  o.id AS order_id, o.order_number, o.created_at, o.buyer_id, o.producer_id, o.status, o.payment_status,
  o.settlement_status, o.currency,
  COALESCE(o.subtotal, o.total_amount - o.delivery_fee) AS items_subtotal,
  o.delivery_fee,
  o.total_amount AS buyer_total,
  o.refunded_amount,
  (SELECT p.internal_reference FROM payments p WHERE p.order_id = o.id ORDER BY p.created_at DESC LIMIT 1) AS payment_reference,
  CASE WHEN is_admin() OR o.producer_id = auth.uid() THEN o.commission_status END AS commission_status,
  CASE WHEN is_admin() OR o.producer_id = auth.uid() THEN o.commission_rate_bps END AS commission_rate_bps,
  CASE WHEN is_admin() OR o.producer_id = auth.uid() THEN o.commission_base END AS commission_base,
  CASE WHEN is_admin() OR o.producer_id = auth.uid() THEN o.commission_rule_id END AS commission_rule_id,
  CASE WHEN is_admin() OR o.producer_id = auth.uid() THEN o.commission_refund_policy END AS commission_refund_policy,
  CASE WHEN (is_admin() OR o.producer_id = auth.uid()) AND o.commission_status IN ('computed', 'legacy') THEN o.platform_fee END AS platform_commission,
  CASE WHEN is_admin() OR o.producer_id = auth.uid() THEN o.commission_reversed END AS commission_reversed,
  CASE WHEN is_admin() OR o.producer_id = auth.uid() THEN o.seller_amount END AS producer_net,
  CASE WHEN (is_admin() OR o.producer_id = auth.uid()) AND o.seller_amount IS NOT NULL AND o.commission_reversed IS NOT NULL
       THEN o.seller_amount - (least(o.refunded_amount, o.commission_base) - o.commission_reversed) END AS producer_net_after_refund
FROM orders o;
GRANT SELECT ON order_financials TO authenticated;

COMMENT ON COLUMN payment_settings.commission_value IS 'OBSOLÈTE depuis la passe 1 : plus utilisée. Voir commission_rules. Valeur historique conservée pour audit ; suppression à décider après validation.';
COMMENT ON COLUMN payment_settings.commission_type IS 'OBSOLÈTE depuis la passe 1 : plus utilisée. Voir commission_rules.';
COMMENT ON COLUMN orders.platform_fee IS 'Commission AgriFlow figée à la création (assiette = produits hors livraison). Applicable seulement si payment_status = paid et commission_status IN (computed, legacy).';

-- 11. payment_apply_result : même fonction que la passe 24 ; SEUL le calcul de commission est remplacé
-- (idempotence, contrôle montant/devise, machine d'états : inchangés).
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
  v_new_status text;
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
    UPDATE payments SET
      status = 'paid', paid_at = now(),
      provider_transaction_id = COALESCE(p_provider_transaction_id, provider_transaction_id),
      provider_status = p_provider_status, operator = p_operator,
      phone_number = COALESCE(p_phone_number, phone_number)
    WHERE id = v_payment.id;

    -- Passe 1 : la commission a été FIGÉE à la création de la commande (trigger orders_commission_snapshot).
    -- Ici on ne recalcule rien : jamais de taux de repli, jamais de configuration « courante ».
    -- Sans règle approuvée au moment de la commande (not_configured / legacy) : pas de net inventé,
    -- règlement en attente (`on_hold`) jusqu'à décision de l'administration.
    IF v_order.commission_status = 'computed' THEN
      UPDATE orders SET
        payment_status = 'paid',
        seller_amount = v_order.commission_base - v_order.platform_fee,
        settlement_status = 'pending'
      WHERE id = v_order.id;
    ELSE
      UPDATE orders SET payment_status = 'paid', seller_amount = NULL, settlement_status = 'on_hold'
      WHERE id = v_order.id;
    END IF;

    INSERT INTO financial_events (order_id, payment_id, event_type, amount, currency, details, idempotency_key)
    VALUES (v_order.id, v_payment.id, 'payment_confirmed', v_payment.amount, v_payment.currency,
      jsonb_build_object('items_subtotal', v_order.commission_base, 'delivery_fee', v_order.delivery_fee,
        'buyer_total', v_order.total_amount, 'commission_status', v_order.commission_status,
        'platform_commission', CASE WHEN v_order.commission_status = 'computed' THEN v_order.platform_fee END,
        'rate_bps', v_order.commission_rate_bps, 'provider_transaction_id', p_provider_transaction_id,
        'source', p_source),
      'payment_confirmed:' || v_payment.id::text)
    ON CONFLICT (idempotency_key) DO NOTHING;

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

-- 12. Remboursements partiels : request_refund (reste dû) et admin_process_refund (statut `refunded` seulement si tout est remboursé)
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

  -- Passe 1 : on rembourse le RESTE dû (paiement − déjà remboursé), jamais plus que ce qui a été payé.
  IF v_payment.amount - v_order.refunded_amount <= 0 THEN
    RETURN _order_error('NOTHING_TO_REFUND');
  END IF;

  INSERT INTO refunds (order_id, payment_id, requested_by, amount, currency, reason)
  VALUES (p_order_id, v_payment.id, v_uid, v_payment.amount - v_order.refunded_amount, v_payment.currency, NULLIF(btrim(COALESCE(p_reason, '')), ''));

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
    -- Passe 1 : le paiement/la commande ne deviennent « refunded » que si le cumul des remboursements
    -- COMPLÉTÉS couvre tout le paiement (le cumul est tenu par le trigger refunds_financial_ledger).
    -- Un remboursement partiel laisse `paid` ; le détail est dans orders.refunded_amount.
    IF (SELECT refunded_amount FROM orders WHERE id = v_refund.order_id)
         >= (SELECT amount FROM payments WHERE id = v_refund.payment_id) THEN
      UPDATE payments SET status = 'refunded', refunded_at = now() WHERE id = v_refund.payment_id;
      UPDATE orders SET payment_status = 'refunded' WHERE id = v_refund.order_id;
    END IF;
    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES ((SELECT buyer_id FROM orders WHERE id = v_refund.order_id), 'refund_completed', 'Remboursement effectué',
            'Votre remboursement de ' || trim_scale(v_refund.amount)::text || ' ' || v_refund.currency || ' a été traité.',
            '/orders/' || v_refund.order_id::text);
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;
