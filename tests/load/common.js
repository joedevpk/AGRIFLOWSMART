// Utilitaires communs des scénarios k6 — STAGING / LOCAL UNIQUEMENT.
import { fail } from 'k6';

export const SUPABASE_URL = (__ENV.K6_SUPABASE_URL || '').replace(/\/$/, '');
export const ANON_KEY = __ENV.K6_SUPABASE_ANON_KEY || '';

/** Refuse de s'exécuter si l'hôte cible est listé comme production (K6_FORBIDDEN_HOSTS="xxxx.supabase.co,app.agriflow.cd"). */
export function assertSafeTarget() {
  if (!SUPABASE_URL || !ANON_KEY) fail('K6_SUPABASE_URL et K6_SUPABASE_ANON_KEY (STAGING) sont obligatoires.');
  const host = SUPABASE_URL.replace(/^https?:\/\//, '').split('/')[0];
  const forbidden = (__ENV.K6_FORBIDDEN_HOSTS || '').split(',').map((h) => h.trim()).filter(Boolean);
  if (forbidden.includes(host)) fail(`Refus : ${host} est listé comme PRODUCTION (K6_FORBIDDEN_HOSTS). Aucun test de charge sur la production.`);
  if (!__ENV.K6_CONFIRM_NOT_PRODUCTION) fail('Définir K6_CONFIRM_NOT_PRODUCTION=yes pour confirmer que la cible est un staging/local.');
}

export function headers(token) {
  return { apikey: ANON_KEY, Authorization: `Bearer ${token || ANON_KEY}`, 'Content-Type': 'application/json' };
}

// Profils de charge progressifs et modestes (montée, palier, descente). À augmenter par étapes, jamais d'emblée.
export const LIGHT = [
  { duration: '30s', target: 5 },
  { duration: '1m', target: 20 },
  { duration: '30s', target: 0 },
];

export const THRESHOLDS = {
  http_req_failed: ['rate<0.01'],
  http_req_duration: ['p(95)<800'],
};
