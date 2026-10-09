import { useFavoritesContext } from '@/contexts/favorites-context';

/** Favoris de l'utilisateur connecté : état partagé (voir FavoritesProvider). */
export function useFavorites() {
  return useFavoritesContext();
}
