import { useEffect, useState } from 'react';
import { fetchProducerPresence, type ProducerPresence } from '@/services/availabilityService';

/** Dernière activité d'UN producteur (appel unique, lecture seule). `null` tant que la donnée n'existe pas. */
export function useProducerPresence(userId: string | null | undefined): ProducerPresence | null {
  const [state, setState] = useState<{ id: string; value: ProducerPresence | null } | null>(null);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void fetchProducerPresence([userId]).then((rows) => { if (!cancelled) setState({ id: userId, value: rows[0] ?? null }); });
    return () => { cancelled = true; };
  }, [userId]);
  return userId && state?.id === userId ? state.value : null;
}
