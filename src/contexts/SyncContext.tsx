import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { currentConnectionState, subscribeConnection, type ConnectionState } from '@/lib/offline/connection';
import { retryDelay, type QueuedOp } from '@/lib/offline/queue';
import { execOp, queueFor, type PlotUpsertPayload } from '@/services/agriService';
import { SyncContext, type SyncValue, type SyncState } from '@/contexts/sync-context';

export function SyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const connection = useSyncExternalStore(subscribeConnection, currentConnectionState, () => 'online' as ConnectionState);
  const [state, setState] = useState<SyncState>('idle');
  const [ops, setOps] = useState<QueuedOp[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const running = useRef(false);
  const attempts = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => setOps(uid ? queueFor(uid).list() : []), [uid]);

  const syncNow = useCallback(async () => {
    if (!uid || running.current) return;
    const q = queueFor(uid);
    if (q.list().filter((o) => o.status === 'pending' || o.status === 'auth').length === 0) { refresh(); return; }
    if (currentConnectionState() === 'offline') { refresh(); return; }
    running.current = true;
    setState('syncing');
    try {
      const res = await q.flush((op) => execOp(uid, op));
      refresh();
      if (res.stopped === 'auth') { setState('auth'); return; }
      if (res.stopped === 'network') {
        attempts.current += 1;
        setState('error');
        if (retryTimer.current) clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(() => void syncNow(), retryDelay(attempts.current));
        return;
      }
      attempts.current = 0;
      if (res.done > 0) { setLastSyncedAt(new Date().toISOString()); setDataVersion((v) => v + 1); setState('synced'); setTimeout(() => setState((s) => (s === 'synced' ? 'idle' : s)), 4000); }
      else setState('idle');
    } finally {
      running.current = false;
    }
  }, [uid, refresh]);

  // Changement d'utilisateur : recharger la file de CET utilisateur, jamais celle d'un autre.
  useEffect(() => { refresh(); setState('idle'); attempts.current = 0; if (uid) void syncNow(); }, [uid, refresh, syncNow]);

  // Retour de connexion → synchronisation automatique
  useEffect(() => { if (uid && connection !== 'offline') void syncNow(); }, [connection, uid, syncNow]);

  useEffect(() => () => { if (retryTimer.current) clearTimeout(retryTimer.current); }, []);

  const notifyQueued = useCallback(() => { refresh(); void syncNow(); }, [refresh, syncNow]);

  const resolveConflict = useCallback((opId: string, choice: 'mine' | 'server') => {
    if (!uid) return;
    const q = queueFor(uid);
    const op = q.list().find((o) => o.id === opId);
    if (!op) return;
    if (choice === 'server') q.remove(opId);
    else q.update(opId, { status: 'pending', payload: { ...(op.payload as PlotUpsertPayload), force: true }, lastError: undefined });
    setDataVersion((v) => v + 1);
    refresh();
    void syncNow();
  }, [uid, refresh, syncNow]);

  const discardOp = useCallback((opId: string) => {
    if (!uid) return;
    queueFor(uid).remove(opId);
    setDataVersion((v) => v + 1);
    refresh();
  }, [uid, refresh]);

  const value = useMemo<SyncValue>(() => ({
    connection, state,
    pending: ops.filter((o) => o.status === 'pending' || o.status === 'auth').length,
    problems: ops.filter((o) => o.status === 'rejected' || o.status === 'conflict'),
    lastSyncedAt, dataVersion, notifyQueued, syncNow, resolveConflict, discardOp,
  }), [connection, state, ops, lastSyncedAt, dataVersion, notifyQueued, syncNow, resolveConflict, discardOp]);

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
