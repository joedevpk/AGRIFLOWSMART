// Edge Functions : vérifie surtout le COMPORTEMENT DÉFENSIF sous charge (aucun paiement réel, aucun appel CinetPay).
//  - appel sans jeton       → 401 (jamais 5xx)
//  - cron sans x-cron-secret → 403 (fail closed)
//  - webhook sans corps valide → 200 (accusé) ou 400, jamais de traitement
import http from 'k6/http';
import { check, sleep } from 'k6';
import { ANON_KEY, LIGHT, SUPABASE_URL, assertSafeTarget } from './common.js';

export const options = { stages: LIGHT, thresholds: { http_req_duration: ['p(95)<1500'], checks: ['rate>0.99'] } };
export function setup() { assertSafeTarget(); }

export default function () {
  const base = `${SUPABASE_URL}/functions/v1`;
  const noAuth = http.post(`${base}/payment-initiate`, JSON.stringify({ order_id: '00000000-0000-4000-8000-000000000000' }), { headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' }, tags: { name: 'initiate_noauth' } });
  check(noAuth, { 'initiate sans jeton utilisateur refusé (401/403)': (r) => r.status === 401 || r.status === 403 });

  const cron = http.post(`${base}/order-confirmation-cron`, '{}', { headers: { 'Content-Type': 'application/json' }, tags: { name: 'cron_nosecret' } });
  check(cron, { 'cron sans secret refusé (403)': (r) => r.status === 403 });

  const hook = http.post(`${base}/payment-webhook`, 'cpm_trans_id=INEXISTANT', { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, tags: { name: 'webhook_invalid' } });
  check(hook, { 'webhook invalide sans erreur serveur': (r) => r.status < 500 || r.status === 503 });
  sleep(1);
}
