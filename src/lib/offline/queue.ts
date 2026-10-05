import { isNetworkError } from './connection';
import { readJSON, writeJSON } from './storage';

/**
 * File d'actions hors ligne, persistée localement, rejouée dans l'ordre à la reconnexion.
 *  - réseau coupé      → l'action reste en file, on réessaie plus tard (retry avec délai croissant)
 *  - session expirée   → l'action reste en file, statut « auth » : rien n'est perdu, on demande de se reconnecter
 *  - refus serveur     → statut « rejected » (droits / données invalides) : conservée et visible, jamais rejouée à l'infini
 *  - conflit           → statut « conflict » : l'utilisateur choisit sa version ou celle du serveur
 * Aucune action n'est supprimée tant qu'elle n'a pas été confirmée par le serveur ou abandonnée par l'utilisateur.
 */
export type OpStatus = 'pending' | 'auth' | 'rejected' | 'conflict';

export interface QueuedOp<P = unknown> {
  id: string;
  type: string;
  payload: P;
  createdAt: string;
  attempts: number;
  status: OpStatus;
  lastError?: string;
}

export type ExecResult =
  | { kind: 'ok' }
  | { kind: 'network'; message: string }
  | { kind: 'auth'; message: string }
  | { kind: 'rejected'; message: string }
  | { kind: 'conflict'; message: string };

export function classifyError(err: { message?: string; code?: string; status?: number } | null | undefined): ExecResult {
  const message = err?.message ?? 'Erreur inconnue';
  if (isNetworkError(message)) return { kind: 'network', message };
  if (err?.status === 401 || err?.code === 'PGRST301' || /jwt|token.*expired|not authenticated|invalid.*token|refresh_token/i.test(message)) return { kind: 'auth', message };
  if (err?.status && err.status >= 500) return { kind: 'network', message };
  return { kind: 'rejected', message };
}

export class OfflineQueue {
  constructor(private readonly key: string) {}

  list(): QueuedOp[] {
    return readJSON<QueuedOp[]>(this.key, []);
  }

  private save(ops: QueuedOp[]): boolean {
    return writeJSON(this.key, ops);
  }

  /** Retourne false si le stockage local est plein/indisponible (l'appelant doit prévenir l'utilisateur). */
  enqueue(op: Omit<QueuedOp, 'attempts' | 'status' | 'createdAt'>): boolean {
    const ops = this.list();
    ops.push({ ...op, createdAt: new Date().toISOString(), attempts: 0, status: 'pending' });
    return this.save(ops);
  }

  update(id: string, patch: Partial<QueuedOp>): void {
    this.save(this.list().map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }

  remove(id: string): void {
    this.save(this.list().filter((o) => o.id !== id));
  }

  /** Remplace la charge utile d'une action en attente (ex. fusion de deux modifications de la même parcelle). */
  replaceWhere(match: (o: QueuedOp) => boolean, next: QueuedOp | null): void {
    const ops = this.list();
    const i = ops.findIndex(match);
    if (i === -1) return;
    if (next) ops[i] = next; else ops.splice(i, 1);
    this.save(ops);
  }

  counts(): { pending: number; auth: number; rejected: number; conflict: number } {
    const c = { pending: 0, auth: 0, rejected: 0, conflict: 0 };
    for (const o of this.list()) c[o.status] += 1;
    return c;
  }

  /**
   * Rejoue les actions « pending » et « auth » dans l'ordre. S'arrête au premier échec réseau ou d'authentification
   * pour préserver l'ordre. Retourne un bilan.
   */
  async flush(exec: (op: QueuedOp) => Promise<ExecResult>): Promise<{ done: number; stopped: 'network' | 'auth' | null }> {
    let done = 0;
    for (const op of this.list()) {
      if (op.status === 'rejected' || op.status === 'conflict') continue;
      const res = await exec(op);
      if (res.kind === 'ok') { this.remove(op.id); done += 1; continue; }
      const attempts = op.attempts + 1;
      if (res.kind === 'network') { this.update(op.id, { attempts, status: 'pending', lastError: res.message }); return { done, stopped: 'network' }; }
      if (res.kind === 'auth') { this.update(op.id, { attempts, status: 'auth', lastError: res.message }); return { done, stopped: 'auth' }; }
      this.update(op.id, { attempts, status: res.kind, lastError: res.message });
    }
    return { done, stopped: null };
  }
}

/** Délai avant nouvelle tentative (ms), croissant et plafonné. */
export function retryDelay(attempts: number): number {
  return Math.min(5_000 * 2 ** Math.max(0, attempts - 1), 120_000);
}
