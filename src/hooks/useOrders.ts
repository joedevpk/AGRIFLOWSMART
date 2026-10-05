import { useCallback, useEffect, useRef, useState } from 'react';
import type { OrderWithDetails } from '@/types';
import { fetchOrders, fetchOrdersRange } from '@/services/orderService';

interface UseOrdersOptions {
  /** Active la pagination réelle (page de N commandes + `loadMore`). Sans cette option : les 200 plus récentes (vues de synthèse). */
  pageSize?: number;
}

/** Charge les commandes de l'utilisateur (côté acheteur ou producteur) avec états chargement / erreur. */
export function useOrders(role: 'buyer' | 'producer', userId: string | undefined, options: UseOrdersOptions = {}) {
  const { pageSize } = options;
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pagesRef = useRef(1); // nombre de pages déjà chargées

  const load = useCallback(async () => {
    if (!userId) return;
    if (pageSize) {
      // Rafraîchit toutes les pages déjà affichées en une seule requête (la position de l'utilisateur dans la liste est conservée).
      const result = await fetchOrdersRange(role, userId, 0, pagesRef.current * pageSize);
      if (result.ok) { setOrders(result.data.items); setHasMore(result.data.hasMore); setError(null); }
      else setError(result.message);
    } else {
      const result = await fetchOrders(role, userId);
      if (result.ok) { setOrders(result.data); setError(null); }
      else setError(result.message);
    }
    setLoading(false);
  }, [role, userId, pageSize]);

  useEffect(() => {
    pagesRef.current = 1;
    void load();
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!userId || !pageSize || loadingMore) return;
    setLoadingMore(true);
    const from = pagesRef.current * pageSize;
    const result = await fetchOrdersRange(role, userId, from, from + pageSize);
    if (result.ok) {
      pagesRef.current += 1;
      setOrders((prev) => {
        const known = new Set(prev.map((o) => o.id));
        return [...prev, ...result.data.items.filter((o) => !known.has(o.id))];
      });
      setHasMore(result.data.hasMore);
    } else {
      setError(result.message);
    }
    setLoadingMore(false);
  }, [role, userId, pageSize, loadingMore]);

  const reload = useCallback(async () => {
    setLoading(true);
    await load();
  }, [load]);

  return { orders, loading, error, reload, refresh: load, hasMore, loadMore, loadingMore };
}
