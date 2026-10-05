/*
  # Modules « Ma Parcelle », notes de parcelle et progression AgriGuide

  Tables PRIVÉES (RLS obligatoire, propriétaire uniquement) :
  - user_plots        : parcelles d'un utilisateur
  - plot_notes        : notes rattachées à une parcelle
  - learning_progress : étapes AgriGuide terminées, par culture

  Les identifiants sont générés côté client (uuid) afin de pouvoir créer des données hors connexion
  puis les synchroniser sans doublon (upsert idempotent). La colonne `version` est incrémentée à chaque
  modification : le client s'en sert pour détecter un conflit de synchronisation.

  Le contenu pédagogique (fiches, calendrier) est fourni par l'application ; aucune table de contenu.
  Aucune donnée n'est visible par un autre utilisateur, y compris via l'API REST.
*/

-- ============================================================
-- Fonction utilitaire : version + updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION agri_touch_row()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' THEN
    NEW.version := COALESCE(OLD.version, 1) + 1;
    NEW.user_id := OLD.user_id;  -- le propriétaire ne change jamais
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============================================================
-- user_plots
-- ============================================================
CREATE TABLE IF NOT EXISTS user_plots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  zone_id text CHECK (zone_id IS NULL OR char_length(zone_id) <= 40),
  locality text CHECK (locality IS NULL OR char_length(locality) <= 120),
  latitude numeric(9,6) CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude numeric(9,6) CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  area_value numeric(12,2) NOT NULL CHECK (area_value > 0),
  area_unit text NOT NULL DEFAULT 'm2' CHECK (area_unit IN ('m2', 'are', 'ha')),
  current_crop text CHECK (current_crop IS NULL OR char_length(current_crop) <= 40),
  planned_crop text CHECK (planned_crop IS NULL OR char_length(planned_crop) <= 40),
  start_date date,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'preparing', 'growing', 'harvested', 'resting')),
  water_access text NOT NULL DEFAULT 'inconnu' CHECK (water_access IN ('irrigation', 'cours_eau', 'pluie', 'inconnu')),
  soil_type text CHECK (soil_type IS NULL OR soil_type IN ('sablonneux', 'limoneux', 'argileux', 'sablo-argileux', 'humifere')),
  soil_ph numeric(3,1) CHECK (soil_ph IS NULL OR soil_ph BETWEEN 3 AND 10),
  planned_quantity numeric(12,2) CHECK (planned_quantity IS NULL OR planned_quantity >= 0),
  planned_unit text NOT NULL DEFAULT 'kg' CHECK (char_length(planned_unit) <= 20),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_plots_user ON user_plots(user_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_user_plots_touch ON user_plots;
CREATE TRIGGER trg_user_plots_touch BEFORE INSERT OR UPDATE ON user_plots
  FOR EACH ROW EXECUTE FUNCTION agri_touch_row();

ALTER TABLE user_plots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_plots_owner_select" ON user_plots;
CREATE POLICY "user_plots_owner_select" ON user_plots FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "user_plots_owner_insert" ON user_plots;
CREATE POLICY "user_plots_owner_insert" ON user_plots FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "user_plots_owner_update" ON user_plots;
CREATE POLICY "user_plots_owner_update" ON user_plots FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "user_plots_owner_delete" ON user_plots;
CREATE POLICY "user_plots_owner_delete" ON user_plots FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ============================================================
-- plot_notes
-- ============================================================
CREATE TABLE IF NOT EXISTS plot_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plot_id uuid NOT NULL REFERENCES user_plots(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plot_notes_plot ON plot_notes(plot_id, created_at DESC);

ALTER TABLE plot_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plot_notes_owner_select" ON plot_notes;
CREATE POLICY "plot_notes_owner_select" ON plot_notes FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "plot_notes_owner_insert" ON plot_notes;
CREATE POLICY "plot_notes_owner_insert" ON plot_notes FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (SELECT 1 FROM user_plots p WHERE p.id = plot_id AND p.user_id = (SELECT auth.uid()))
  );
DROP POLICY IF EXISTS "plot_notes_owner_delete" ON plot_notes;
CREATE POLICY "plot_notes_owner_delete" ON plot_notes FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ============================================================
-- learning_progress
-- ============================================================
CREATE TABLE IF NOT EXISTS learning_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  crop_id text NOT NULL CHECK (char_length(crop_id) BETWEEN 1 AND 40),
  step_key text NOT NULL CHECK (char_length(step_key) BETWEEN 1 AND 40),
  completed boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, crop_id, step_key)
);

DROP TRIGGER IF EXISTS trg_learning_progress_touch ON learning_progress;
CREATE TRIGGER trg_learning_progress_touch BEFORE INSERT OR UPDATE ON learning_progress
  FOR EACH ROW EXECUTE FUNCTION agri_touch_row();

ALTER TABLE learning_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "learning_progress_owner_select" ON learning_progress;
CREATE POLICY "learning_progress_owner_select" ON learning_progress FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "learning_progress_owner_insert" ON learning_progress;
CREATE POLICY "learning_progress_owner_insert" ON learning_progress FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "learning_progress_owner_update" ON learning_progress;
CREATE POLICY "learning_progress_owner_update" ON learning_progress FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "learning_progress_owner_delete" ON learning_progress;
CREATE POLICY "learning_progress_owner_delete" ON learning_progress FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ============================================================
-- Droits : aucun accès anonyme
-- ============================================================
REVOKE ALL ON user_plots, plot_notes, learning_progress FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_plots, plot_notes, learning_progress TO authenticated;

NOTIFY pgrst, 'reload schema';
