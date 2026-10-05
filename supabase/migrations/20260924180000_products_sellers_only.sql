/*
  # Publication d'offres réservée aux vendeurs

  Avant : n'importe quel utilisateur connecté pouvait insérer un produit (RLS : auth.uid() = user_id),
  y compris un acheteur, en contournant l'interface.
  Après : seuls les profils « producer », « cooperative » et « admin » peuvent publier une offre.
  Les policies de lecture, de modification et de suppression ne changent pas.
*/

DROP POLICY IF EXISTS "products_owner_insert" ON products;
CREATE POLICY "products_owner_insert" ON products FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = auth.uid()
        AND p.role IN ('producer', 'cooperative', 'admin')
    )
  );
