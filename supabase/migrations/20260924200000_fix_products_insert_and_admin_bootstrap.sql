/*
  # Correctif « ajout de produits » + création du compte administrateur

  ## Pourquoi l'ajout de produits ne marchait plus
  La migration 20260924180000_products_sellers_only vérifiait le rôle du vendeur avec un
  sous-SELECT direct sur `profiles` à l'intérieur de la policy d'insertion. Ce test dépend
  des droits de lecture de l'utilisateur sur `profiles` (colonnes restreintes depuis la migration
  auth_roles_rls_hardening) et échoue dès qu'un compte n'a pas de ligne `profiles`
  (comptes créés avant le trigger handle_new_user).

  ## Ce que fait cette migration
  1. `can_publish_products()` : fonction SECURITY DEFINER qui lit le rôle sans dépendre des droits
     colonne/RLS de l'appelant (même principe que is_admin()).
  2. Recrée la policy `products_owner_insert` avec cette fonction (producer / cooperative / admin).
  3. Recrée les profils manquants pour les comptes auth.users existants (rôle lu dans les
     métadonnées d'inscription, sinon `buyer`) — jamais `admin`.
  4. Rappelle les GRANT de base sur `products`.
  5. ADMIN : le trigger anti-escalade laisse passer les sessions sans utilisateur JWT
     (éditeur SQL Supabase, service_role, migrations) ; un utilisateur connecté non-admin reste bloqué.
  6. `make_admin(email)` : promeut un compte existant en admin. Réservée à postgres / service_role
     (aucun accès via l'API publique).
  7. Bloc DO final : promeut automatiquement l'email indiqué dans `v_admin_email` s'il existe déjà.

  ## Créer l'administrateur
  1. Créez le compte normalement depuis /register (email + mot de passe de votre choix).
  2. Modifiez `v_admin_email` plus bas AVANT d'exécuter la migration, ou exécutez ensuite dans
     l'éditeur SQL Supabase :   SELECT make_admin('votre@email.com');
  3. Reconnectez-vous : /admin est accessible.
  Aucun mot de passe n'est écrit dans la migration.
*/

-- ============================================================
-- 1. Droit de publier — indépendant de la RLS de l'appelant
-- ============================================================
CREATE OR REPLACE FUNCTION can_publish_products()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = auth.uid()
      AND role IN ('producer', 'cooperative', 'admin')
  );
$$;

REVOKE ALL ON FUNCTION can_publish_products() FROM public;
GRANT EXECUTE ON FUNCTION can_publish_products() TO authenticated;

-- ============================================================
-- 2. Policy d'insertion des produits
-- ============================================================
DROP POLICY IF EXISTS "products_owner_insert" ON products;
CREATE POLICY "products_owner_insert" ON products FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND can_publish_products());

-- ============================================================
-- 3. Profils manquants (comptes créés avant le trigger)
-- ============================================================
INSERT INTO public.profiles (user_id, role, full_name, phone, province, city)
SELECT
  u.id,
  CASE WHEN u.raw_user_meta_data ->> 'role' IN ('producer', 'cooperative', 'buyer')
       THEN u.raw_user_meta_data ->> 'role' ELSE 'buyer' END,
  COALESCE(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1)),
  u.raw_user_meta_data ->> 'phone',
  u.raw_user_meta_data ->> 'province',
  u.raw_user_meta_data ->> 'city'
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================
-- 4. Droits de base sur products
-- ============================================================
GRANT SELECT ON products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON products TO authenticated;

-- ============================================================
-- 5. Trigger anti-escalade : autorise l'éditeur SQL / service_role
-- ============================================================
CREATE OR REPLACE FUNCTION prevent_privilege_escalation()
RETURNS TRIGGER AS $$
BEGIN
  -- auth.uid() est NULL hors API utilisateur (éditeur SQL, service_role, migration).
  -- Un utilisateur connecté via l'API a toujours un uid : il reste soumis au contrôle.
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

-- ============================================================
-- 6. make_admin(email)
-- ============================================================
CREATE OR REPLACE FUNCTION make_admin(p_email text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_email text;
BEGIN
  SELECT id, email INTO v_id, v_email FROM auth.users WHERE lower(email) = lower(trim(p_email));
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Aucun compte pour « % » : créez d''abord le compte depuis /register.', p_email;
  END IF;

  INSERT INTO profiles (user_id, role, full_name, is_verified)
  VALUES (v_id, 'admin', split_part(v_email, '@', 1), true)
  ON CONFLICT (user_id) DO UPDATE SET role = 'admin', is_verified = true;

  RETURN v_email || ' est maintenant administrateur';
END;
$$;

REVOKE ALL ON FUNCTION make_admin(text) FROM public, anon, authenticated;

-- ============================================================
-- 7. Promotion automatique (à personnaliser)
-- ============================================================
DO $$
DECLARE
  v_admin_email text := 'admin@agriflow.cd';  -- <== REMPLACEZ par l'email du compte déjà créé
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(v_admin_email)) THEN
    PERFORM make_admin(v_admin_email);
    RAISE NOTICE 'Admin activé : %', v_admin_email;
  ELSE
    RAISE NOTICE 'Aucun compte % : créez-le via /register puis exécutez SELECT make_admin(''email'');', v_admin_email;
  END IF;
END $$;
