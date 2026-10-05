// Connexion Supabase Auth. Comptes de TEST uniquement (K6_USER_EMAIL / K6_USER_PASSWORD). Attention aux limites d'envoi d'Auth :
// garder une charge faible (Supabase limite aussi les connexions par IP).
import http from 'k6/http';
import { check, sleep } from 'k6';
import { ANON_KEY, SUPABASE_URL, THRESHOLDS, assertSafeTarget, headers } from './common.js';

export const options = { stages: [{ duration: '30s', target: 3 }, { duration: '1m', target: 5 }, { duration: '15s', target: 0 }], thresholds: THRESHOLDS };
export function setup() { assertSafeTarget(); if (!__ENV.K6_USER_EMAIL || !__ENV.K6_USER_PASSWORD) throw new Error('K6_USER_EMAIL / K6_USER_PASSWORD (compte de test) requis'); }

export default function () {
  const res = http.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, JSON.stringify({ email: __ENV.K6_USER_EMAIL, password: __ENV.K6_USER_PASSWORD }), { headers: headers(ANON_KEY), tags: { name: 'login' } });
  check(res, { 'connexion 200': (r) => r.status === 200, 'jeton présent': (r) => !!r.json('access_token') });
  sleep(2);
}
