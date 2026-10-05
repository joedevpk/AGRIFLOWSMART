import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/components/ui/toast-store';
import { useAuth } from '@/contexts/auth-context';
import { addFavorite, fetchFavoriteProductIds, removeFavorite } from '@/services/favoritesService';

/**
 * Favoris de l'utilisateur connecté (table `favorites`, RLS propriétaire).
 * Un seul chargement pour toute une liste ; bascule optimiste avec retour arrière si l'écriture échoue.
 */
export function useFavorites() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true); // vrai tant que la liste n'est pas connue : évite un faux « aucun favori »
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const inFlight = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!user) { setIds(new Set()); setLoading(false); return; }
    setLoading(true);
    setError(false);
    const result = await fetchFavoriteProductIds(user.id);
    if (result.ok) setIds(new Set(result.data));
    else setError(true);
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const toggle = useCallback(async (productId: string) => {
    if (!user) { toast('info', 'Connectez-vous pour enregistrer des favoris.'); navigate('/login'); return; }
    if (inFlight.current.has(productId)) return; // protège du double clic
    inFlight.current.add(productId);
    const next = !ids.has(productId);
    setBusy((b) => new Set(b).add(productId));
    setIds((s) => { const n = new Set(s); if (next) n.add(productId); else n.delete(productId); return n; });
    const ok = next ? await addFavorite(user.id, productId) : await removeFavorite(user.id, productId);
    if (!ok) {
      setIds((s) => { const n = new Set(s); if (next) n.delete(productId); else n.add(productId); return n; });
      toast('error', 'Impossible de mettre à jour vos favoris. Réessayez.');
    }
    inFlight.current.delete(productId);
    setBusy((b) => { const n = new Set(b); n.delete(productId); return n; });
  }, [user, ids, navigate]);

  return { ids, loading, error, reload: load, busy, has: (id: string) => ids.has(id), toggle };
}
