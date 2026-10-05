import { CATEGORIES } from '@/lib/constants';
import { PRODUCT_LIST_WITH_PRODUCER } from '@/lib/columns';
import { comparableQuantity, MARKET_CHIPS, normalize, PRICE_RANGES, QUANTITY_OPTIONS, type MarketFilters } from '@/lib/marketplace';
import { pageRange } from '@/lib/pagination';
import { supabase } from '@/lib/supabase';

/**
 * Requête marketplace PAGINÉE côté serveur : les filtres de l'URL sont traduits en conditions PostgREST,
 * on ne charge qu'une page (+1 ligne pour savoir s'il y en a une autre).
 *
 * Recherche : chaque mot doit se retrouver dans le nom, la variété, la catégorie, la ville, la province ou la description.
 * Insensible à la casse ET aux accents sans extension SQL : le mot est transformé en expression régulière
 * (`mais` → `ma[iïî]s`) via l'opérateur PostgREST `imatch`. Le nom du producteur n'est plus recherché (il l'était côté client).
 */
const ACCENTS: Record<string, string> = { a: 'aàâä', c: 'cç', e: 'eéèêë', i: 'iîï', o: 'oôö', u: 'uùûü', y: 'yÿ' };
const KNOWN_UNITS = ['kg', 'tonne', 'sac_50kg', 'sac_100kg'] as const;

/** Mot de recherche réduit à [a-z0-9] (aucun caractère spécial PostgREST/regex ne peut passer). */
export function searchTokens(q: string): string[] {
  return normalize(q).split(/\s+/).map((t) => t.replace(/[^a-z0-9]/g, '')).filter((t) => t.length > 0).slice(0, 5);
}

/** `mais` → `ma[iîï]s` : motif d'expression régulière insensible aux accents. */
export function accentPattern(token: string): string {
  return token.split('').map((ch) => (ACCENTS[ch] ? `[${ACCENTS[ch]}]` : ch)).join('');
}

const TEXT_COLUMNS = ['name', 'variety', 'category', 'city', 'province', 'description'] as const;

/** Clause `or(...)` d'un mot : une des colonnes texte correspond, ou la catégorie dont le libellé contient le mot. */
export function tokenClause(token: string): string {
  const pattern = accentPattern(token);
  const parts: string[] = TEXT_COLUMNS.map((c) => `${c}.imatch.${pattern}`);
  CATEGORIES.filter((c) => normalize(c.label).includes(token)).forEach((c) => parts.push(`category.eq.${c.id}`));
  return parts.join(',');
}

/** Condition « quantité ≥ N kg » exprimée par unité (kg, tonne, sacs ; autres unités : valeur brute, comme côté client). */
export function quantityClause(minKg: number): string {
  const perUnit = KNOWN_UNITS.map((u) => `and(unit.eq.${u},quantity.gte.${minKg / comparableQuantity(1, u)})`);
  perUnit.push(`and(unit.not.in.(${KNOWN_UNITS.join(',')}),quantity.gte.${minKg})`);
  return perUnit.join(',');
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Applique les filtres à une requête `products` (type volontairement souple : le builder Supabase est chaîné). */
export function applyServerFilters<Q extends { or: (f: string) => Q; eq: (c: string, v: string) => Q; gte: (c: string, v: number) => Q; lt: (c: string, v: number) => Q; gt: (c: string, v: string) => Q }>(query: Q, f: MarketFilters): Q {
  let q = query;
  searchTokens(f.q).forEach((t) => { q = q.or(tokenClause(t)); });

  const chip = MARKET_CHIPS.find((c) => c.id === f.type);
  if (chip) {
    const parts: string[] = (chip.names ?? []).map((n) => `name.imatch.${accentPattern(n)}`);
    if (chip.category) parts.push(`category.eq.${chip.category}`);
    if (parts.length) q = q.or(parts.join(','));
  }
  if (f.category) q = q.eq('category', f.category);
  if (f.province) q = q.eq('province', f.province);

  const price = PRICE_RANGES.find((r) => r.id === f.price);
  if (price) {
    q = q.gte('price', price.min);
    if (Number.isFinite(price.max)) q = q.lt('price', price.max);
  }
  const qty = QUANTITY_OPTIONS.find((o) => o.id === f.qty);
  if (qty) q = q.or(quantityClause(qty.kg));

  const today = todayISO();
  if (f.avail === 'now') q = q.or(`availability_date.is.null,availability_date.lte.${today}`);
  if (f.avail === 'soon') q = q.gt('availability_date', today);
  return q;
}

export interface MarketPage<T> { items: T[]; hasMore: boolean; total: number | null }

export async function fetchMarketplacePage(f: MarketFilters, page: number, size: number, withCount: boolean): Promise<{ data: unknown[]; hasMore: boolean; total: number | null; error: string | null }> {
  const [from, to] = pageRange(page, size);
  let query = supabase
    .from('products')
    .select(PRODUCT_LIST_WITH_PRODUCER, withCount ? { count: 'exact' } : undefined)
    .eq('status', 'available');
  query = applyServerFilters(query, f);
  if (f.sort === 'price_asc') query = query.order('price', { ascending: true }).order('created_at', { ascending: false }).order('id');
  else if (f.sort === 'price_desc') query = query.order('price', { ascending: false }).order('created_at', { ascending: false }).order('id');
  else query = query.order('created_at', { ascending: false }).order('id');
  const { data, error, count } = await query.range(from, to);
  if (error) return { data: [], hasMore: false, total: null, error: error.message };
  const rows = data ?? [];
  return { data: rows.slice(0, size), hasMore: rows.length > size, total: count ?? null, error: null };
}
