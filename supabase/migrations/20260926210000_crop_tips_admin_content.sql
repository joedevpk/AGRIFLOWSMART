/*
  # Conseils agricoles administrables (Passe 15 — Fonctionnalité 12)

  Les cultures, guides, étapes et calendriers d'AgriFlow RDC restent des données
  statiques versionnées dans le code (src/lib/agri/crops.ts, calendar.ts) : ce sont
  des règles agronomiques génériques, pas des données par utilisateur, et les
  dupliquer dans Supabase sans les relier au reste de l'app aurait créé deux
  sources de vérité divergentes. En revanche, aucune structure n'existait pour
  qu'un administrateur ajoute du contenu réellement dynamique : c'est l'objet de
  cette migration, qui reste strictement additive (aucune table existante n'est
  modifiée ni supprimée).

  ## Nouvelle table
  - `crop_tips` : conseils courts rattachés à une culture (par son identifiant
    statique, ex. 'mais'), gérés par un administrateur et affichés aux
    producteurs dans AgriGuide pour cette culture.

  ## Sécurité
  - Lecture publique des conseils actifs uniquement (`is_active = true`).
  - Écriture (création / modification / activation / suppression) réservée aux
    administrateurs via `is_admin()` (fonction déjà définie, SECURITY DEFINER).
  - Aucune clé service_role n'est utilisée côté client.
*/

CREATE TABLE IF NOT EXISTS crop_tips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crop_id text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crop_tips_crop_id_idx ON crop_tips (crop_id) WHERE is_active = true;

ALTER TABLE crop_tips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crop_tips_select_active_public" ON crop_tips;
CREATE POLICY "crop_tips_select_active_public"
  ON crop_tips FOR SELECT
  TO anon, authenticated
  USING (is_active = true OR is_admin());

DROP POLICY IF EXISTS "crop_tips_admin_insert" ON crop_tips;
CREATE POLICY "crop_tips_admin_insert"
  ON crop_tips FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "crop_tips_admin_update" ON crop_tips;
CREATE POLICY "crop_tips_admin_update"
  ON crop_tips FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "crop_tips_admin_delete" ON crop_tips;
CREATE POLICY "crop_tips_admin_delete"
  ON crop_tips FOR DELETE
  TO authenticated
  USING (is_admin());

CREATE OR REPLACE FUNCTION set_crop_tips_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS crop_tips_set_updated_at ON crop_tips;
CREATE TRIGGER crop_tips_set_updated_at
  BEFORE UPDATE ON crop_tips
  FOR EACH ROW EXECUTE FUNCTION set_crop_tips_updated_at();
