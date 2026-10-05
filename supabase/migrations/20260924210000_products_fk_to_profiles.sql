/*
  # Correctif erreur 400 sur GET /rest/v1/products

  Le front demande  select=*,profiles!products_user_id_fkey(...)  mais la clé étrangère
  products_user_id_fkey pointait vers auth.users, pas vers profiles : PostgREST ne trouve
  aucune relation products -> profiles et répond 400 (PGRST200).

  Correction : products.user_id référence maintenant profiles(user_id) (colonne UNIQUE),
  sous le même nom de contrainte. Aucun changement de code front nécessaire.
*/

-- Profils manquants (sinon la clé étrangère ne peut pas être créée)
INSERT INTO public.profiles (user_id, role, full_name)
SELECT u.id, 'buyer', COALESCE(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1))
FROM auth.users u
WHERE u.id IN (SELECT DISTINCT user_id FROM public.products)
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_user_id_fkey;
ALTER TABLE public.products
  ADD CONSTRAINT products_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

-- Recharge le cache de schéma de PostgREST
NOTIFY pgrst, 'reload schema';
