/*
  # Passe 19 — Demandes de suppression de compte (droit à l'effacement, traitement MANUEL)

  Principe : AUCUNE suppression automatique. Supprimer un utilisateur (auth.users) supprime en
  cascade son profil, ses offres, ses commandes d'acheteur, ses messages… et peut donc affecter
  ses partenaires de commande. La demande est donc simplement ENREGISTRÉE ici, puis examinée
  par un administrateur qui vérifie les règles métier (commandes en cours, paiements, obligations
  de conservation à confirmer juridiquement) avant toute exécution.

  Sécurité (RLS toujours actif) :
  - Un utilisateur ne peut ni insérer ni modifier directement : uniquement via les deux RPC ci-dessous.
  - Il ne lit que SES demandes ; l'administrateur (is_admin()) lit et traite tout.
  - user_id passe à NULL si le compte est supprimé (la trace d'audit est conservée sans identifiant).
*/

CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'processing', 'completed', 'rejected', 'cancelled')),
  reason text CHECK (reason IS NULL OR char_length(reason) <= 500),
  -- Photographie, à la demande, du nombre de commandes non terminées (aide à la décision de l'admin).
  active_orders_count integer NOT NULL DEFAULT 0 CHECK (active_orders_count >= 0),
  admin_note text CHECK (admin_note IS NULL OR char_length(admin_note) <= 2000),
  processed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

-- Une seule demande « ouverte » par utilisateur.
CREATE UNIQUE INDEX IF NOT EXISTS uq_account_deletion_open
  ON account_deletion_requests(user_id) WHERE status IN ('requested', 'processing');
CREATE INDEX IF NOT EXISTS idx_account_deletion_status ON account_deletion_requests(status, created_at);

CREATE OR REPLACE FUNCTION account_deletion_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_account_deletion_touch ON account_deletion_requests;
CREATE TRIGGER trg_account_deletion_touch BEFORE UPDATE ON account_deletion_requests
  FOR EACH ROW EXECUTE FUNCTION account_deletion_touch();

ALTER TABLE account_deletion_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON account_deletion_requests FROM anon;

DROP POLICY IF EXISTS "account_deletion_owner_read" ON account_deletion_requests;
CREATE POLICY "account_deletion_owner_read" ON account_deletion_requests FOR SELECT
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "account_deletion_admin_all" ON account_deletion_requests;
CREATE POLICY "account_deletion_admin_all" ON account_deletion_requests FOR ALL
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- ------------------------------------------------------------
-- RPC : enregistrer une demande (aucune donnée n'est supprimée)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION request_account_deletion(p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_count integer;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  END IF;
  IF v_reason IS NOT NULL AND char_length(v_reason) > 500 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REASON_TOO_LONG');
  END IF;
  IF EXISTS (SELECT 1 FROM account_deletion_requests WHERE user_id = v_uid AND status IN ('requested', 'processing')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_REQUESTED');
  END IF;

  SELECT count(*) INTO v_count FROM orders
   WHERE (buyer_id = v_uid OR producer_id = v_uid) AND status NOT IN ('completed', 'cancelled');

  INSERT INTO account_deletion_requests (user_id, reason, active_orders_count)
  VALUES (v_uid, v_reason, v_count)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'active_orders', v_count);
END;
$$;

-- ------------------------------------------------------------
-- RPC : annuler sa propre demande (tant qu'elle n'est pas en traitement)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION cancel_account_deletion()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_updated integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  END IF;
  UPDATE account_deletion_requests
     SET status = 'cancelled', processed_at = now()
   WHERE user_id = v_uid AND status = 'requested';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_CANCELLABLE');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION request_account_deletion(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION request_account_deletion(text) TO authenticated;
REVOKE ALL ON FUNCTION cancel_account_deletion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cancel_account_deletion() TO authenticated;
