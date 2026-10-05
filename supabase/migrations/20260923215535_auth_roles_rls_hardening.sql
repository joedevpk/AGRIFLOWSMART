/*
# AgriFlow RDC — Auth, Rôles & Durcissement RLS

## Contexte
Cette migration fait suite à l'audit sécurité. Elle N'AJOUTE AUCUN DROP destructif
et ne touche à aucune donnée existante. Elle complète le schéma du
20260923202159_create_core_schema.sql.

## Ce que fait cette migration

1. ROLES
   - Ajoute le rôle `admin` à la contrainte CHECK de `profiles.role` (on conserve
     producer / cooperative / buyer existants, on ajoute admin en plus).
   - Ajoute une fonction `is_admin()` (SECURITY DEFINER, évite la récursion RLS)
     utilisée par toutes les policies "admin" ci-dessous.

2. ANTI ESCALADE DE PRIVILÈGES (faille critique corrigée)
   - Avant cette migration, un utilisateur authentifié pouvait s'auto-attribuer
     le rôle `admin` (ou se vérifier lui-même) en appelant directement l'API
     REST Supabase (insert/update sur `profiles`), car aucune policy ne
     contrôlait la valeur de `role` ou `is_verified`.
   - Un trigger `prevent_privilege_escalation` interdit désormais à un
     utilisateur non-admin de modifier son propre `role` ou `is_verified`.
   - La policy d'insertion interdit explicitement de créer un profil avec
     `role = 'admin'` via l'inscription publique.

3. PROFIL AUTOMATIQUE FIABLE (AUTH → SESSION → PROFILE)
   - Avant cette migration, le profil était créé par un second appel réseau
     côté client juste après `signUp`. En cas d'échec réseau ou de fermeture
     d'onglet entre les deux appels, l'utilisateur se retrouvait authentifié
     SANS profil (donc sans rôle, route cassée).
   - Un trigger `handle_new_user` sur `auth.users` crée maintenant le profil
     automatiquement et de façon atomique côté serveur, à partir des métadonnées
     transmises à `signUp` (`full_name`, `role`, `buyer_type`, `phone`,
     `province`, `city`). Le rôle transmis est validé côté serveur (jamais
     `admin`, défaut `buyer` si absent/invalide).

4. PROTECTION DES DONNÉES PERSONNELLES (téléphone)
   - Avant cette migration, la colonne `profiles.phone` était lisible par
     n'importe qui (y compris non connecté) via `select('*')` sur `profiles`
     (utilisé notamment par la page publique /producer/:id et par /admin).
   - Le téléphone n'est plus accessible en lecture directe par `anon` ni par
     un `authenticated` quelconque : seul le propriétaire, un admin, ou un
     participant à une commande partagée avec ce profil peut le lire — via la
     fonction `get_profile_phone(user_id)` (SECURITY DEFINER).
   - Les autres champs (nom, ville, avatar, bio, vérifié...) restent publics,
     nécessaires à l'annuaire producteurs et au marketplace (inchangés).

5. RLS ADMIN
   - Ajoute une policy "admin a accès à tout" (ALL) sur chaque table métier,
     en plus des policies existantes (participant/propriétaire), pour que
     /admin fonctionne réellement pour un compte `role = 'admin'` — et
     uniquement pour lui (le frontend ne fait plus foi, RLS contrôle).

6. INTÉGRITÉ DES COMMANDES
   - `orders` : à la création, `producer_id` doit correspondre au vrai
     propriétaire du produit commandé (empêche un acheteur de rattacher une
     commande à un autre producteur que celui du produit).
   - `orders` : les champs `buyer_id`, `producer_id`, `product_id` deviennent
     immuables après création (un participant ne peut plus réassigner sa
     commande à quelqu'un d'autre) ; seul un admin peut les modifier.

7. NOTIFICATIONS INTER-UTILISATEURS (bug de sécurité + bug fonctionnel)
   - Avant cette migration, la policy n'autorisait un insert que si
     `user_id = auth.uid()` : un acheteur ne pouvait donc jamais notifier un
     producteur (et inversement), la fonctionnalité était silencieusement
     cassée pour les nouvelles commandes / changements de statut.
   - La nouvelle policy autorise l'insertion d'une notification vers un
     utilisateur avec qui l'auteur partage une commande réelle — jamais vers
     un utilisateur arbitraire (empêche le spam de notifications).

8. HISTORIQUE DE COMMANDE
   - `order_status_history.changed_by` doit désormais correspondre à
     `auth.uid()` (empêche d'attribuer un changement de statut à quelqu'un
     d'autre).

9. STORAGE (buckets avatars / product-images)
   - Crée les buckets `avatars` et `product-images` (lecture publique,
     écriture/suppression réservées au propriétaire du fichier, convention de
     chemin `{user_id}/...`).

## Sécurité
Toutes les policies s'appuient sur RLS (jamais sur une vérification frontend
uniquement), conformément à la consigne du projet.
*/

-- ============================================================
-- 1. FONCTION UTILITAIRE is_admin()
-- ============================================================
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION is_admin() FROM public;
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;

-- ============================================================
-- 2. ROLE ADMIN DANS LA CONTRAINTE
-- ============================================================
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('producer', 'cooperative', 'buyer', 'admin'));

-- ============================================================
-- 3. ANTI ESCALADE DE PRIVILÈGES
-- ============================================================

-- 3a. Interdit de s'auto-inscrire avec le rôle admin
DROP POLICY IF EXISTS "profiles_owner_insert" ON profiles;
CREATE POLICY "profiles_owner_insert" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id AND role <> 'admin');

-- 3b. Interdit à un non-admin de modifier son propre role / is_verified
CREATE OR REPLACE FUNCTION prevent_privilege_escalation()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT is_admin() THEN
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

DROP TRIGGER IF EXISTS trg_prevent_privilege_escalation ON profiles;
CREATE TRIGGER trg_prevent_privilege_escalation
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_privilege_escalation();

-- ============================================================
-- 4. CRÉATION AUTOMATIQUE ET FIABLE DU PROFIL (auth.users -> profiles)
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role text;
  v_buyer_type text;
BEGIN
  v_role := NEW.raw_user_meta_data ->> 'role';
  IF v_role IS NULL OR v_role NOT IN ('producer', 'cooperative', 'buyer') THEN
    v_role := 'buyer';
  END IF;

  v_buyer_type := NEW.raw_user_meta_data ->> 'buyer_type';
  IF v_buyer_type NOT IN ('restaurant', 'market', 'wholesaler', 'agro_industry', 'enterprise') THEN
    v_buyer_type := NULL;
  END IF;

  INSERT INTO public.profiles (user_id, role, buyer_type, full_name, phone, province, city)
  VALUES (
    NEW.id,
    v_role,
    CASE WHEN v_role = 'buyer' THEN v_buyer_type ELSE NULL END,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data ->> 'phone',
    NEW.raw_user_meta_data ->> 'province',
    NEW.raw_user_meta_data ->> 'city'
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_handle_new_user ON auth.users;
CREATE TRIGGER trg_handle_new_user
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 5. TELEPHONE : accès restreint (owner / admin / participant à une commande)
-- ============================================================
-- IMPORTANT : un simple `REVOKE SELECT (phone) ... FROM authenticated` ne
-- suffit pas si un GRANT SELECT global sur la table existe déjà (c'est le cas
-- par défaut chez Supabase : `GRANT ALL ON ALL TABLES IN SCHEMA public ...`).
-- Un privilège de table couvre implicitement toutes les colonnes ; il faut
-- donc d'abord retirer le SELECT au niveau table, puis le redonner colonne
-- par colonne en excluant `phone`.
REVOKE SELECT ON profiles FROM anon, authenticated;
GRANT SELECT (
  id, user_id, role, buyer_type, full_name, province, city, bio,
  avatar_url, is_verified, created_at, updated_at
) ON profiles TO anon, authenticated;

CREATE OR REPLACE FUNCTION get_profile_phone(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text;
  v_allowed boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  IF auth.uid() = p_user_id THEN
    v_allowed := true;
  ELSIF is_admin() THEN
    v_allowed := true;
  ELSIF EXISTS (
    SELECT 1 FROM orders
    WHERE (orders.buyer_id = auth.uid() AND orders.producer_id = p_user_id)
       OR (orders.producer_id = auth.uid() AND orders.buyer_id = p_user_id)
  ) THEN
    v_allowed := true;
  END IF;

  IF NOT v_allowed THEN
    RETURN NULL;
  END IF;

  SELECT phone INTO v_phone FROM profiles WHERE user_id = p_user_id;
  RETURN v_phone;
END;
$$;

REVOKE ALL ON FUNCTION get_profile_phone(uuid) FROM public;
GRANT EXECUTE ON FUNCTION get_profile_phone(uuid) TO authenticated;

-- ============================================================
-- 6. RLS ADMIN SUR TOUTES LES TABLES MÉTIER
-- ============================================================
DROP POLICY IF EXISTS "profiles_admin_all" ON profiles;
CREATE POLICY "profiles_admin_all" ON profiles FOR ALL
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "products_admin_all" ON products;
CREATE POLICY "products_admin_all" ON products FOR ALL
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "requests_admin_all" ON buyer_requests;
CREATE POLICY "requests_admin_all" ON buyer_requests FOR ALL
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "orders_admin_all" ON orders;
CREATE POLICY "orders_admin_all" ON orders FOR ALL
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "history_admin_all" ON order_status_history;
CREATE POLICY "history_admin_all" ON order_status_history FOR ALL
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "messages_admin_all" ON messages;
CREATE POLICY "messages_admin_all" ON messages FOR ALL
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "notif_admin_all" ON notifications;
CREATE POLICY "notif_admin_all" ON notifications FOR ALL
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "fav_admin_all" ON favorites;
CREATE POLICY "fav_admin_all" ON favorites FOR ALL
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "reviews_admin_all" ON reviews;
CREATE POLICY "reviews_admin_all" ON reviews FOR ALL
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "delivery_admin_all" ON deliveries;
CREATE POLICY "delivery_admin_all" ON deliveries FOR ALL
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- ============================================================
-- 7. INTEGRITE DES COMMANDES
-- ============================================================
DROP POLICY IF EXISTS "orders_buyer_insert" ON orders;
CREATE POLICY "orders_buyer_insert" ON orders FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = buyer_id
    AND producer_id = (SELECT user_id FROM products WHERE id = product_id)
  );

CREATE OR REPLACE FUNCTION protect_order_core_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT is_admin() THEN
    IF NEW.buyer_id IS DISTINCT FROM OLD.buyer_id
       OR NEW.producer_id IS DISTINCT FROM OLD.producer_id
       OR NEW.product_id IS DISTINCT FROM OLD.product_id THEN
      RAISE EXCEPTION 'Réassignation de commande non autorisée';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_protect_order_core_fields ON orders;
CREATE TRIGGER trg_protect_order_core_fields
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION protect_order_core_fields();

-- ============================================================
-- 8. HISTORIQUE DE COMMANDE : changed_by fiable
-- ============================================================
DROP POLICY IF EXISTS "history_participant_insert" ON order_status_history;
CREATE POLICY "history_participant_insert" ON order_status_history FOR INSERT
  TO authenticated WITH CHECK (
    (changed_by IS NULL OR changed_by = auth.uid())
    AND EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_status_history.order_id
      AND (orders.buyer_id = auth.uid() OR orders.producer_id = auth.uid())
    )
  );

-- ============================================================
-- 9. NOTIFICATIONS ENTRE PARTICIPANTS D'UNE MEME COMMANDE
-- ============================================================
DROP POLICY IF EXISTS "notif_owner_insert" ON notifications;
CREATE POLICY "notif_insert" ON notifications FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM orders
      WHERE (orders.buyer_id = auth.uid() AND orders.producer_id = notifications.user_id)
         OR (orders.producer_id = auth.uid() AND orders.buyer_id = notifications.user_id)
    )
  );

-- ============================================================
-- 10. STORAGE — buckets avatars / product-images
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_owner_write" ON storage.objects;
CREATE POLICY "avatars_owner_write" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (
    bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars_owner_update" ON storage.objects;
CREATE POLICY "avatars_owner_update" ON storage.objects FOR UPDATE
  TO authenticated USING (
    bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text
  ) WITH CHECK (
    bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars_owner_delete" ON storage.objects;
CREATE POLICY "avatars_owner_delete" ON storage.objects FOR DELETE
  TO authenticated USING (
    bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "product_images_public_read" ON storage.objects;
CREATE POLICY "product_images_public_read" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "product_images_owner_write" ON storage.objects;
CREATE POLICY "product_images_owner_write" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (
    bucket_id = 'product-images' AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "product_images_owner_update" ON storage.objects;
CREATE POLICY "product_images_owner_update" ON storage.objects FOR UPDATE
  TO authenticated USING (
    bucket_id = 'product-images' AND (storage.foldername(name))[1] = auth.uid()::text
  ) WITH CHECK (
    bucket_id = 'product-images' AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "product_images_owner_delete" ON storage.objects;
CREATE POLICY "product_images_owner_delete" ON storage.objects FOR DELETE
  TO authenticated USING (
    bucket_id = 'product-images' AND (storage.foldername(name))[1] = auth.uid()::text
  );
