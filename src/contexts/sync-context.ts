import { createContext, useContext } from 'react';
import type { ConnectionState } from '@/lib/offline/connection';
import type { QueuedOp } from '@/lib/offline/queue';

export type SyncState = 'idle' | 'syncing' | 'synced' | 'error' | 'auth';

export interface SyncValue {
  connection: ConnectionState;
  state: SyncState;
  pending: number;
  problems: QueuedOp[];
  lastSyncedAt: string | null;
  /** Incrémenté après chaque synchronisation réussie : les pages rechargent leurs données. */
  dataVersion: number;
  notifyQueued: () => void;
  syncNow: () => Promise<void>;
  resolveConflict: (opId: string, choice: 'mine' | 'server') => void;
  discardOp: (opId: string) => void;
}

export const SyncContext = createContext<SyncValue | null>(null);

export function useSync(): SyncValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync doit être utilisé dans <SyncProvider>');
  return ctx;
}

/** Version légère pour les composants qui n'ont besoin que de l'état de connexion. */
export function useConnection(): ConnectionState {
  const ctx = useContext(SyncContext);
  return ctx?.connection ?? 'online';
}
