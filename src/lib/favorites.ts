/** Utilitaires purs des favoris (testés) : jamais de mutation de l'ensemble reçu. */

export function withFavorite(ids: ReadonlySet<string>, productId: string, present: boolean): Set<string> {
  const next = new Set(ids);
  if (present) next.add(productId);
  else next.delete(productId);
  return next;
}

/** Nom accessible dynamique du bouton cœur. */
export function favoriteLabel(active: boolean, productName?: string): string {
  const base = active ? 'Retirer' : 'Ajouter';
  const where = active ? 'des favoris' : 'aux favoris';
  return productName ? `${base} ${productName} ${where}` : `${base} ${where}`;
}
