import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useSync } from '@/contexts/sync-context';
import { loadProgress, progressKey, setProgress, type ProgressMap } from '@/services/agriService';
import { STEP_KEYS } from '@/lib/agri/crops';
import { toast } from '@/components/ui/toast-store';

export function cropProgress(map: ProgressMap, cropId: string): { done: number; total: number; pct: number; nextIndex: number } {
  const total = STEP_KEYS.length;
  const done = STEP_KEYS.filter((k) => map[progressKey(cropId, k)]).length;
  const nextIndex = STEP_KEYS.findIndex((k) => !map[progressKey(cropId, k)]);
  return { done, total, pct: Math.round((done / total) * 100), nextIndex };
}

/** Progression AgriGuide : lecture serveur/cache + écriture locale immédiate, synchronisée ensuite. */
export function useProgress() {
  const { user } = useAuth();
  const { dataVersion, notifyQueued } = useSync();
  const [map, setMap] = useState<ProgressMap>({});
  const [loading, setLoading] = useState(false);
  const [fromCache, setFromCache] = useState(false);

  useEffect(() => {
    if (!user) { setMap({}); return; }
    let cancelled = false;
    setLoading(true);
    void loadProgress(user.id).then((r) => { if (!cancelled) { setMap(r.data); setFromCache(r.fromCache); setLoading(false); } });
    return () => { cancelled = true; };
  }, [user, dataVersion]);

  const toggle = useCallback((cropId: string, stepKey: string, value: boolean): boolean => {
    if (!user) return false;
    if (!setProgress(user.id, cropId, stepKey, value)) {
      toast('error', 'Le stockage de cet appareil est indisponible : votre progression n\'a pas pu être enregistrée.');
      return false;
    }
    setMap((m) => ({ ...m, [progressKey(cropId, stepKey)]: value }));
    notifyQueued();
    return true;
  }, [user, notifyQueued]);

  return { map, loading, fromCache, toggle, isAuthed: Boolean(user) };
}
