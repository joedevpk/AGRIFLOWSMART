import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Les Edge Functions tournent sous Deno ; le module partagé `http.ts` n'utilise que fetch / AbortController / Deno.env.
// On l'importe ici avec un `Deno.env` factice et on l'exerce contre un VRAI serveur HTTP local (timeouts, 4xx, 5xx, JSON invalide, retry borné).
interface Http {
  fetchExternal: (url: string, init: RequestInit, opts?: { timeoutMs?: number; retries?: number }) => Promise<{ ok: boolean; status: number; json: unknown; failure?: string }>;
  isTransient: (failure: string | undefined) => boolean;
}
let http: Http;
let server: Server;
let base = '';
const hits: Record<string, number> = {};

beforeAll(async () => {
  (globalThis as unknown as { Deno: unknown }).Deno = { env: { get: () => undefined } };
  const path = '../../supabase/functions/_shared/http.ts';
  http = (await import(/* @vite-ignore */ path)) as Http;
  server = createServer((req, res) => {
    const route = req.url ?? '/';
    hits[route] = (hits[route] ?? 0) + 1;
    if (route === '/ok') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"code":"201"}'); }
    else if (route === '/bad-json') { res.writeHead(200); res.end('<html>pas du json</html>'); }
    else if (route === '/404') { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"message":"non"}'); }
    else if (route === '/500') { res.writeHead(500); res.end('{}'); }
    else if (route === '/flaky') { if (hits[route] === 1) { res.writeHead(503); res.end('{}'); } else { res.writeHead(200); res.end('{"ok":true}'); } }
    else if (route === '/slow') { setTimeout(() => { res.writeHead(200); res.end('{}'); }, 1500); }
    else { res.writeHead(500); res.end(); }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.closeAllConnections?.(); server.close(); });

describe('appels HTTP externes (CinetPay, Resend) : bornés et classés', () => {
  it('succès', async () => {
    const r = await http.fetchExternal(`${base}/ok`, { method: 'POST' });
    expect(r).toMatchObject({ ok: true, status: 200, json: { code: '201' } });
  });
  it('réponse invalide (pas du JSON)', async () => {
    const r = await http.fetchExternal(`${base}/bad-json`, {});
    expect(r).toMatchObject({ ok: false, failure: 'invalid_response' });
  });
  it('4xx : échec définitif, AUCUN retry même demandé', async () => {
    hits['/404'] = 0;
    const r = await http.fetchExternal(`${base}/404`, {}, { retries: 2 });
    expect(r).toMatchObject({ ok: false, status: 404, failure: 'http_4xx' });
    expect(hits['/404']).toBe(1);
  });
  it('5xx : réessai borné (jamais de boucle infinie)', async () => {
    hits['/500'] = 0;
    const r = await http.fetchExternal(`${base}/500`, {}, { retries: 99 });
    expect(r.failure).toBe('http_5xx');
    expect(hits['/500']).toBe(3); // 1 essai + 2 réessais au maximum, même si retries=99
  });
  it('échec temporaire puis succès au réessai', async () => {
    hits['/flaky'] = 0;
    const r = await http.fetchExternal(`${base}/flaky`, {}, { retries: 1 });
    expect(r.ok).toBe(true);
    expect(hits['/flaky']).toBe(2);
  });
  it('sans retry demandé : un seul appel (initiation de paiement)', async () => {
    hits['/500'] = 0;
    await http.fetchExternal(`${base}/500`, {});
    expect(hits['/500']).toBe(1);
  });
  it('timeout', async () => {
    const r = await http.fetchExternal(`${base}/slow`, {}, { timeoutMs: 150 });
    expect(r).toMatchObject({ ok: false, failure: 'timeout' });
  });
  it('prestataire injoignable', async () => {
    const r = await http.fetchExternal('http://127.0.0.1:1/', {}, { timeoutMs: 500 });
    expect(r.ok).toBe(false);
    expect(['network', 'timeout']).toContain(r.failure);
  });
  it('échec temporaire vs définitif', () => {
    expect(http.isTransient('timeout')).toBe(true);
    expect(http.isTransient('network')).toBe(true);
    expect(http.isTransient('http_5xx')).toBe(true);
    expect(http.isTransient('http_4xx')).toBe(false);
    expect(http.isTransient('invalid_response')).toBe(false);
    expect(http.isTransient(undefined)).toBe(false);
  });
});
