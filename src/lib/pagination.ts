/**
 * Pagination par page + `range()` (compatible mobile : bouton « Voir plus », jamais de chargement massif).
 * On demande `size + 1` lignes : la ligne en trop indique qu'il existe une page suivante, sans requête de comptage.
 */
export function pageRange(page: number, size: number): [number, number] {
  const from = Math.max(0, page) * size;
  return [from, from + size]; // bornes incluses côté PostgREST → size + 1 lignes
}

export function sliceHasMore<T>(rows: T[] | null | undefined, size: number): { items: T[]; hasMore: boolean } {
  const list = rows ?? [];
  return { items: list.slice(0, size), hasMore: list.length > size };
}

/** Taille de page par écran (une seule source de vérité). */
export const PAGE_SIZE = {
  marketplace: 24,
  notifications: 20,
  orders: 20,
  products: 20,
  requests: 20,
  admin: 20,
} as const;
