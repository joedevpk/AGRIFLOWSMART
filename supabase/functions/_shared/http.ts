// CORS : si FRONTEND_URL est défini (recommandé en production), seul ce site peut appeler les fonctions depuis un navigateur ;
// sinon '*' (développement). Le webhook CinetPay et le cron n'ont pas besoin de CORS (appels serveur à serveur).
const ALLOWED_ORIGIN = (Deno.env.get('FRONTEND_URL') ?? '').replace(/\/$/, '') || '*';

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

export function errorResponse(code: string, message: string, status = 400): Response {
  return jsonResponse({ ok: false, code, message }, status);
}

/** Réponse HTTP 200 vide, attendue par CinetPay pour accuser réception du webhook. */
export function ackResponse(): Response {
  return new Response('OK', { status: 200, headers: CORS_HEADERS });
}

/** Réponse 503 : l'erreur est TEMPORAIRE chez nous ou chez le prestataire, l'appelant peut réessayer plus tard. */
export function retryLaterResponse(): Response {
  return new Response('RETRY LATER', { status: 503, headers: { ...CORS_HEADERS, 'Retry-After': '60' } });
}

export const EXTERNAL_TIMEOUT_MS = 10_000;

export type ExternalFailure = 'timeout' | 'network' | 'http_4xx' | 'http_5xx' | 'invalid_response';

export interface ExternalResult {
  ok: boolean;
  status: number;
  /** Corps JSON décodé ; `null` si la réponse n'est pas du JSON valide. */
  json: unknown | null;
  failure?: ExternalFailure;
}

/**
 * Appel HTTP externe borné : délai maximal, jamais d'exception, classement des échecs.
 * `retries` ne s'applique qu'aux échecs TEMPORAIRES (timeout, réseau, 5xx) et doit rester faible (0 ou 1) : pas de boucle infinie.
 * À n'utiliser avec retries > 0 que pour des opérations sans effet de bord (lecture / vérification).
 */
export async function fetchExternal(url: string, init: RequestInit, opts: { timeoutMs?: number; retries?: number } = {}): Promise<ExternalResult> {
  const timeoutMs = opts.timeoutMs ?? EXTERNAL_TIMEOUT_MS;
  const retries = Math.min(Math.max(opts.retries ?? 0, 0), 2);
  let last: ExternalResult = { ok: false, status: 0, json: null, failure: 'network' };
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      const text = await res.text();
      let json: unknown | null = null;
      try { json = text ? JSON.parse(text) : null; } catch { json = null; }
      if (res.status >= 500) last = { ok: false, status: res.status, json, failure: 'http_5xx' };
      else if (res.status >= 400) return { ok: false, status: res.status, json, failure: 'http_4xx' }; // définitif : pas de retry
      else if (json === null) return { ok: false, status: res.status, json: null, failure: 'invalid_response' };
      else return { ok: true, status: res.status, json };
    } catch (err) {
      last = { ok: false, status: 0, json: null, failure: (err as Error)?.name === 'AbortError' ? 'timeout' : 'network' };
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
  return last;
}

/** Échec temporaire (le prestataire est peut-être joignable plus tard) par opposition à un refus définitif. */
export function isTransient(failure: ExternalFailure | undefined): boolean {
  return failure === 'timeout' || failure === 'network' || failure === 'http_5xx';
}

/** Journal serveur sans données sensibles : n'écrire que des identifiants techniques, jamais téléphone / token / clé. */
export function logEvent(level: 'info' | 'warn' | 'error', fn: string, message: string, extra: Record<string, string | number | boolean | null | undefined> = {}): void {
  const line = JSON.stringify({ app: 'agriflow-edge', ts: new Date().toISOString(), level, fn, message, ...extra });
  if (level === 'error') console.error(line); else if (level === 'warn') console.warn(line); else console.info(line);
}
