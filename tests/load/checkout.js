// Checkout (ÉCRIT : crée des commandes) → staging avec K6_ALLOW_WRITES=yes, compte acheteur de test et un produit de test (K6_PRODUCT_ID) à stock élevé.
// Chaque itération utilise un checkout_id unique ; une itération sur 5 rejoue le même checkout_id pour mesurer l'idempotence sous charge.
import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
import { ANON_KEY, SUPABASE_URL, assertSafeTarget, headers } from './common.js';

export const options = { stages: [{ duration: '30s', target: 3 }, { duration: '1m', target: 8 }, { duration: '15s', target: 0 }], thresholds: { http_req_failed: ['rate<0.02'], http_req_duration: ['p(95)<1500'] } };

export function setup() {
  assertSafeTarget();
  if (__ENV.K6_ALLOW_WRITES !== 'yes') fail('Définir K6_ALLOW_WRITES=yes : ce scénario crée des commandes (staging uniquement).');
  if (!__ENV.K6_USER_EMAIL || !__ENV.K6_USER_PASSWORD || !__ENV.K6_PRODUCT_ID) fail('K6_USER_EMAIL, K6_USER_PASSWORD et K6_PRODUCT_ID requis.');
  const login = http.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, JSON.stringify({ email: __ENV.K6_USER_EMAIL, password: __ENV.K6_USER_PASSWORD }), { headers: headers(ANON_KEY) });
  return { token: login.json('access_token') };
}

const DELIVERY = { recipient_name: 'Test Charge', recipient_phone: '+243812345678', address: 'Avenue de test 1', city: 'Kinshasa' };

export default function (data) {
  const checkoutId = __ITER % 5 === 4 && __VU > 0 ? `00000000-0000-4000-8000-${String(__VU).padStart(12, '0')}` : uuidv4();
  const res = http.post(`${SUPABASE_URL}/rest/v1/rpc/create_order_from_cart`, JSON.stringify({
    p_checkout_id: checkoutId, p_items: [{ product_id: __ENV.K6_PRODUCT_ID, quantity: 1 }], p_delivery: DELIVERY, p_payment_method: 'cash_on_delivery',
  }), { headers: headers(data.token), tags: { name: 'create_order' } });
  check(res, { 'RPC 200': (r) => r.status === 200, 'ok ou refus métier explicite': (r) => ['true', 'false'].includes(String(r.json('ok'))) });
  sleep(1);
}
