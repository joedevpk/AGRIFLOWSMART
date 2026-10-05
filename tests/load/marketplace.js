// Lecture publique : liste paginée du marketplace, recherche, fiche produit. Lecture seule (aucune écriture).
// k6 run -e K6_SUPABASE_URL=https://<staging>.supabase.co -e K6_SUPABASE_ANON_KEY=<anon> -e K6_CONFIRM_NOT_PRODUCTION=yes tests/load/marketplace.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { ANON_KEY, LIGHT, SUPABASE_URL, THRESHOLDS, assertSafeTarget, headers } from './common.js';

export const options = { stages: LIGHT, thresholds: THRESHOLDS };
export function setup() { assertSafeTarget(); }

const COLUMNS = 'id,user_id,name,category,price,currency,quantity,unit,images,city,province,status,created_at';
const TERMS = ['ma', 'manioc', 'riz', 'tomate', 'haricot'];

export default function () {
  const page = Math.floor(Math.random() * 3);
  const list = http.get(`${SUPABASE_URL}/rest/v1/products?select=${COLUMNS}&status=eq.available&order=created_at.desc,id&limit=25&offset=${page * 24}`, { headers: headers(ANON_KEY), tags: { name: 'marketplace_list' } });
  check(list, { 'liste 200': (r) => r.status === 200, 'au plus 25 lignes': (r) => r.json().length <= 25 });

  const term = TERMS[Math.floor(Math.random() * TERMS.length)];
  const search = http.get(`${SUPABASE_URL}/rest/v1/products?select=${COLUMNS}&status=eq.available&or=(name.imatch.${term},category.imatch.${term})&order=created_at.desc,id&limit=25`, { headers: headers(ANON_KEY), tags: { name: 'marketplace_search' } });
  check(search, { 'recherche 200': (r) => r.status === 200 });

  const items = list.json();
  if (items.length > 0) {
    const id = items[Math.floor(Math.random() * items.length)].id;
    const detail = http.get(`${SUPABASE_URL}/rest/v1/products?select=*,profiles!products_user_id_fkey(full_name,city,province,is_verified,role)&id=eq.${id}`, { headers: headers(ANON_KEY), tags: { name: 'product_detail' } });
    check(detail, { 'fiche 200': (r) => r.status === 200 });
  }
  sleep(1 + Math.random() * 2);
}
