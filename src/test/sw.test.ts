import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';
import { currentShellCacheName } from '@/lib/offline/precache';

/**
 * Exécute public/sw.js dans un bac à sable Node avec de faux `caches` / `fetch` (aucun navigateur) et vérifie :
 * versionnement du cache, nettoyage des anciens caches, aucune interception cross-origin, aucune mise en cache des pages privées,
 * des réponses `no-store`/`private` ni des requêtes authentifiées.
 */
type Listener = (event: unknown) => void;
class FakeCache {
  store = new Map<string, unknown>();
  async match(req: unknown) { return this.store.get(keyOf(req)); }
  async put(req: unknown, res: unknown) { this.store.set(keyOf(req), res); }
}
const keyOf = (req: unknown) => (typeof req === 'string' ? req : (req as { url: string }).url).replace('https://app.test', '') || '/';

function makeResponse(init: { ok?: boolean; type?: string; cacheControl?: string } = {}) {
  const res = { ok: init.ok ?? true, type: init.type ?? 'basic', headers: { get: (h: string) => (h.toLowerCase() === 'cache-control' ? init.cacheControl ?? null : null) }, clone: () => res };
  return res;
}
function makeRequest(path: string, opts: { mode?: string; authorization?: boolean; origin?: string } = {}) {
  return { url: `${opts.origin ?? 'https://app.test'}${path}`, method: 'GET', mode: opts.mode ?? 'no-cors', headers: { has: (h: string) => h.toLowerCase() === 'authorization' && !!opts.authorization } };
}

function boot(buildId: string, existing: string[] = []) {
  const caches = new Map<string, FakeCache>(existing.map((n) => [n, new FakeCache()]));
  const listeners: Record<string, Listener> = {};
  let networkResponse = makeResponse();
  let networkDown = false;
  const fetched: string[] = [];
  const source = readFileSync('public/sw.js', 'utf8').replace(/__BUILD_ID__/g, buildId);
  const sandbox = {
    self: { location: { origin: 'https://app.test' }, addEventListener: (t: string, l: Listener) => { listeners[t] = l; }, skipWaiting: () => {}, clients: { claim: async () => {} } },
    caches: {
      open: async (n: string) => { if (!caches.has(n)) caches.set(n, new FakeCache()); return caches.get(n)!; },
      keys: async () => [...caches.keys()],
      delete: async (n: string) => caches.delete(n),
    },
    fetch: async (req: { url: string }) => { fetched.push(req.url); if (networkDown) throw new Error('offline'); return networkResponse; },
    Response: class { constructor(public body: string, public init: { status: number }) {} static error() { return { error: true }; } },
    URL, Promise,
  };
  vm.runInNewContext(source, sandbox);
  const dispatch = async (req: ReturnType<typeof makeRequest>) => {
    let responded: Promise<unknown> | null = null;
    listeners.fetch({ request: req, respondWith: (p: Promise<unknown>) => { responded = p; } });
    return responded ? await responded : 'IGNORED';
  };
  const activate = async () => { let p: Promise<unknown> = Promise.resolve(); listeners.activate({ waitUntil: (x: Promise<unknown>) => { p = x; } }); await p; };
  return { caches, dispatch, activate, setNetwork: (r: ReturnType<typeof makeResponse>) => { networkResponse = r; }, setDown: (d: boolean) => { networkDown = d; }, fetched };
}

describe('service worker (public/sw.js)', () => {
  beforeEach(() => { delete (globalThis as { caches?: unknown }).caches; });

  it('le cache est versionné par build et les anciens caches sont supprimés à l\'activation', async () => {
    const sw = boot('b2', ['agriflow-shell-v1', 'agriflow-shell-b1', 'autre-application']);
    await sw.activate();
    expect([...sw.caches.keys()].sort()).toEqual(['agriflow-shell-b2', 'autre-application']); // courant créé, anciens supprimés, caches étrangers intacts
  });

  it('precache.ts retrouve le cache courant par son préfixe', async () => {
    const sw = boot('abc123');
    await sw.activate();
    (globalThis as unknown as { caches: unknown }).caches = { keys: async () => [...sw.caches.keys()] };
    expect(await currentShellCacheName()).toBe('agriflow-shell-abc123');
  });

  it('n\'intercepte JAMAIS une requête vers un autre domaine (Supabase, CinetPay, images externes)', async () => {
    const sw = boot('b1');
    expect(await sw.dispatch(makeRequest('/rest/v1/orders', { origin: 'https://abc.supabase.co' }))).toBe('IGNORED');
    expect(await sw.dispatch(makeRequest('/pay', { origin: 'https://secure.cinetpay.com', mode: 'navigate' }))).toBe('IGNORED');
    expect(sw.fetched).toEqual([]);
  });

  it('ne gère ni les requêtes non-GET ni /sw.js lui-même', async () => {
    const sw = boot('b1');
    expect(await sw.dispatch({ ...makeRequest('/x'), method: 'POST' })).toBe('IGNORED');
    expect(await sw.dispatch(makeRequest('/sw.js'))).toBe('IGNORED');
  });

  it('navigation : seule la coquille publique est conservée, jamais une page privée / paiement / commande', async () => {
    const sw = boot('b1');
    await sw.dispatch(makeRequest('/', { mode: 'navigate' }));
    const cache = sw.caches.get('agriflow-shell-b1')!;
    expect(cache.store.has('/')).toBe(true);
    cache.store.clear();
    for (const path of ['/payment/result/AF-PAY-1', '/orders/123', '/checkout', '/profile', '/admin', '/messages', '/producer/orders', '/notifications']) {
      await sw.dispatch(makeRequest(path, { mode: 'navigate' }));
    }
    expect(cache.store.size).toBe(0);
  });

  it('hors connexion : la navigation retombe sur la coquille, sinon un message clair', async () => {
    const sw = boot('b1');
    await sw.dispatch(makeRequest('/', { mode: 'navigate' }));
    sw.setDown(true);
    const fromCache = await sw.dispatch(makeRequest('/marketplace', { mode: 'navigate' }));
    expect(fromCache).toBeDefined();
    const fresh = boot('b9'); fresh.setDown(true);
    const offline = (await fresh.dispatch(makeRequest("/", { mode: "navigate" }))) as unknown as { init: { status: number } };
    expect(offline.init.status).toBe(503);
  });

  it('ne met pas en cache les réponses no-store / private, les erreurs, les réponses opaques, ni les requêtes authentifiées', async () => {
    const sw = boot('b1');
    const cache = async () => (await sw.caches.get('agriflow-shell-b1')) ?? new FakeCache();
    for (const response of [makeResponse({ cacheControl: 'no-store' }), makeResponse({ cacheControl: 'private, max-age=60' }), makeResponse({ ok: false }), makeResponse({ type: 'opaque' })]) {
      sw.setNetwork(response);
      await sw.dispatch(makeRequest('/assets/index-abc.js'));
      expect((await cache()).store.has('/assets/index-abc.js')).toBe(false);
    }
    sw.setNetwork(makeResponse());
    await sw.dispatch(makeRequest('/data.json', { authorization: true }));
    expect((await cache()).store.has('/data.json')).toBe(false);
  });

  it('met en cache les fichiers hachés /assets/* et les sert ensuite sans réseau', async () => {
    const sw = boot('b1');
    await sw.dispatch(makeRequest('/assets/index-abc.js'));
    expect(sw.caches.get('agriflow-shell-b1')!.store.has('/assets/index-abc.js')).toBe(true);
    const before = sw.fetched.length;
    await sw.dispatch(makeRequest('/assets/index-abc.js'));
    expect(sw.fetched.length).toBe(before);
  });

  it('un fichier haché indisponible (hors connexion) ne provoque pas d\'exception non gérée', async () => {
    const sw = boot('b1'); sw.setDown(true);
    expect(await sw.dispatch(makeRequest('/assets/nouveau-xyz.js'))).toEqual({ error: true });
  });
});
