import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { classifyError, OfflineQueue, retryDelay } from './offline/queue';
import { isNetworkError } from './offline/connection';

/** localStorage en mémoire (les tests tournent sous Node, sans navigateur). */
function installStorage() {
  const data = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, String(v)); }, removeItem: (k) => { data.delete(k); },
    clear: () => data.clear(), key: (i) => [...data.keys()][i] ?? null, get length() { return data.size; },
  } as Storage;
}

describe('file d\'actions hors ligne', () => {
  beforeEach(installStorage);
  afterEach(() => { delete (globalThis as { localStorage?: Storage }).localStorage; });

  const op = (id: string) => ({ id, type: 'note', payload: { id } });

  it('rejoue dans l\'ordre et vide la file', async () => {
    const q = new OfflineQueue('t');
    q.enqueue(op('a')); q.enqueue(op('b')); q.enqueue(op('c'));
    const seen: string[] = [];
    const res = await q.flush(async (o) => { seen.push(o.id); return { kind: 'ok' }; });
    expect(seen).toEqual(['a', 'b', 'c']);
    expect(res).toEqual({ done: 3, stopped: null });
    expect(q.list()).toHaveLength(0);
  });
  it('s\'arrête au premier échec réseau pour préserver l\'ordre, sans rien perdre', async () => {
    const q = new OfflineQueue('t');
    q.enqueue(op('a')); q.enqueue(op('b')); q.enqueue(op('c'));
    const seen: string[] = [];
    const res = await q.flush(async (o) => { seen.push(o.id); return o.id === 'b' ? { kind: 'network', message: 'Failed to fetch' } : { kind: 'ok' }; });
    expect(seen).toEqual(['a', 'b']);
    expect(res.stopped).toBe('network');
    expect(q.list().map((o) => o.id)).toEqual(['b', 'c']);
    expect(q.list()[0].attempts).toBe(1);
  });
  it('un refus serveur est conservé mais jamais rejoué à l\'infini', async () => {
    const q = new OfflineQueue('t');
    q.enqueue(op('a')); q.enqueue(op('b'));
    await q.flush(async (o) => (o.id === 'a' ? { kind: 'rejected', message: 'droits' } : { kind: 'ok' }));
    expect(q.counts()).toEqual({ pending: 0, auth: 0, rejected: 1, conflict: 0 });
    let calls = 0;
    await q.flush(async () => { calls += 1; return { kind: 'ok' }; });
    expect(calls).toBe(0);
  });
  it('session expirée : l\'action reste en file (statut auth)', async () => {
    const q = new OfflineQueue('t');
    q.enqueue(op('a'));
    const res = await q.flush(async () => ({ kind: 'auth', message: 'JWT expired' }));
    expect(res.stopped).toBe('auth');
    expect(q.counts().auth).toBe(1);
  });
  it('classification des erreurs', () => {
    expect(classifyError({ message: 'Failed to fetch' }).kind).toBe('network');
    expect(classifyError({ message: 'x', status: 503 }).kind).toBe('network');
    expect(classifyError({ message: 'JWT expired' }).kind).toBe('auth');
    expect(classifyError({ message: 'x', status: 401 }).kind).toBe('auth');
    expect(classifyError({ message: 'violates row-level security policy' }).kind).toBe('rejected');
    expect(isNetworkError('NetworkError when attempting to fetch resource')).toBe(true);
  });
  it('délai de nouvelle tentative croissant et plafonné', () => {
    expect(retryDelay(1)).toBe(5_000);
    expect(retryDelay(2)).toBe(10_000);
    expect(retryDelay(50)).toBe(120_000);
  });
  it('stockage plein : enqueue renvoie false au lieu de perdre l\'action en silence', () => {
    (globalThis.localStorage as Storage).setItem = () => { throw new Error('QuotaExceededError'); };
    expect(new OfflineQueue('t').enqueue(op('a'))).toBe(false);
  });
});
