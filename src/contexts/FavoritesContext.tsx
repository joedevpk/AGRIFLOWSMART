import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/components/ui/toast-store';
import { useAuth } from '@/contexts/auth-context';
import { FavoritesContext, type FavoritesContextValue } from '@/contexts/favorites-context';
import { addFavorite, fetchFavoriteProductIds, removeFavorite } from '@/services/favoritesService';
import { withFavorite } from '@/lib/favorites';

/**
 * État unique des favoris (table `favorites`, RLS propriétaire) partagé par la marketplace, les fiches produit,
 * les listes et la page « Mes favoris » : un cœur a le même état partout, avec un seul chargement par compte.
 * À placer à l'intérieur du routeur (redirection vers la connexion).
 */
export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const userId = user?.id ?? null;

  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());
  const idsRef = useRef<ReadonlySet<string>>(ids);
  const inFlight = useRef<Set<string>>(new Set());
  const request = useRef(0);

  const commit = useCallback((next: ReadonlySet<string>) => {
    idsRef.current = next;
    setIds(next);
  }, []);

  const load = useCallback(async () => {
    if (authLoading) return;
    const current = ++request.current; // ignore les réponses d'un compte / d'un appel précédent
    if (!userId) {
      commit(new Set());
      setError(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    const result = await fetchFavoriteProductIds(userId);
    if (current !== request.current) return;
    if (result.ok) commit(new Set(result.data));
    else setError(true);
    setLoading(false);
  }, [authLoading, userId, commit]);

  useEffect(() => { void load(); }, [load]);

  const toggle = useCallback(async (productId: string) => {
    if (!userId) {
      toast('info', 'Connectez-vous pour enregistrer des favoris.');
      navigate('/login', { state: { from: `${window.location.pathname}${window.location.search}` } });
      return;
    }
    if (inFlight.current.has(productId)) return; // un seul appel à la fois par produit : pas de requêtes contradictoires
    inFlight.current.add(productId);
    const next = !idsRef.current.has(productId);
    setBusy((b) => withFavorite(b, productId, true));
    commit(withFavorite(idsRef.current, productId, next));

    let ok = false;
    try {
      ok = next ? await addFavorite(userId, productId) : await removeFavorite(userId, productId);
    } catch {
      ok = false;
    }
    if (!ok) {
      commit(withFavorite(idsRef.current, productId, !next)); // retour à l'état réel du serveur
      toast('error', 'Impossible de mettre à jour vos favoris. Vérifiez votre connexion et réessayez.');
    } else if (!next) {
      toast('info', 'Retiré de vos favoris.');
    }
    inFlight.current.delete(productId);
    setBusy((b) => withFavorite(b, productId, false));
  }, [userId, navigate, commit]);

  const value = useMemo<FavoritesContextValue>(
    () => ({ ids, loading, error, reload: load, busy, has: (id: string) => ids.has(id), toggle }),
    [ids, loading, error, load, busy, toggle],
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}
