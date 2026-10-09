import { createContext, useContext } from 'react';

export interface FavoritesContextValue {
  /** Identifiants des produits favoris de l'utilisateur connecté (source unique pour toutes les vues). */
  ids: ReadonlySet<string>;
  /** Vrai tant que la liste n'est pas connue : évite un faux « aucun favori ». */
  loading: boolean;
  error: boolean;
  reload: () => Promise<void>;
  /** Produits dont une écriture est en cours. */
  busy: ReadonlySet<string>;
  has: (productId: string) => boolean;
  /** Bascule optimiste, retour arrière + message si l'écriture échoue ; invite à se connecter sinon. */
  toggle: (productId: string) => Promise<void>;
}

export const FavoritesContext = createContext<FavoritesContextValue | undefined>(undefined);

export function useFavoritesContext(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites doit être utilisé dans <FavoritesProvider>.');
  return ctx;
}
