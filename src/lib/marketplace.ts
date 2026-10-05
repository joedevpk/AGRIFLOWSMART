import type { Product, ProductWithProfile } from '@/types';
import { CATEGORIES, PRODUCT_STATUS_LABELS } from '@/lib/constants';

/* ------------------------------------------------------------------ */
/*  Helpers texte                                                      */
/* ------------------------------------------------------------------ */

/** Minuscules + suppression des accents : « Maïs » == « mais ». */
export function normalize(value: string | null | undefined): string {
  return (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function productLocation(p: Pick<Product, 'city' | 'province'>): string {
  if (p.city && p.province && normalize(p.city) !== normalize(p.province)) return `${p.city}, ${p.province}`;
  return p.city || p.province || 'RDC';
}

/** Texte alternatif descriptif pour les images produit (accessibilité + SEO). */
export function productAlt(p: Pick<Product, 'name' | 'city' | 'province'>): string {
  const place = p.city || p.province;
  return place ? `${p.name} — production de ${place}` : p.name;
}

/* ------------------------------------------------------------------ */
/*  Puces de catégorie (ligne horizontale principale)                  */
/* ------------------------------------------------------------------ */

export interface MarketChip {
  id: string;
  label: string;
  /** Correspondance sur le nom du produit (sans accents). */
  names?: string[];
  /** Correspondance sur l'identifiant de catégorie en base. */
  category?: string;
}

export const MARKET_CHIPS: MarketChip[] = [
  { id: 'maize', label: 'Maïs', names: ['mais'] },
  { id: 'cassava', label: 'Manioc', names: ['manioc'] },
  { id: 'tomato', label: 'Tomate', names: ['tomate'] },
  { id: 'rice', label: 'Riz', names: ['riz'] },
  { id: 'coffee', label: 'Café', names: ['cafe'] },
  { id: 'cacao', label: 'Cacao', names: ['cacao'] },
  { id: 'soy', label: 'Soja', names: ['soja'] },
  { id: 'vegetables', label: 'Légumes', category: 'vegetables' },
  { id: 'fruits', label: 'Fruits', category: 'fruits' },
];

/* ------------------------------------------------------------------ */
/*  Disponibilité                                                      */
/* ------------------------------------------------------------------ */

export type AvailabilityTone = 'available' | 'soon' | 'reserved' | 'soldout' | 'draft';

function todayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function getAvailability(p: Pick<Product, 'status' | 'availability_date'>): { tone: AvailabilityTone; label: string } {
  if (p.status === 'available') {
    if (p.availability_date && p.availability_date > todayISO()) {
      const short = new Date(`${p.availability_date}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
      return { tone: 'soon', label: `Dès le ${short}` };
    }
    return { tone: 'available', label: PRODUCT_STATUS_LABELS.available };
  }
  if (p.status === 'reserved') return { tone: 'reserved', label: PRODUCT_STATUS_LABELS.reserved };
  if (p.status === 'sold_out') return { tone: 'soldout', label: PRODUCT_STATUS_LABELS.sold_out };
  return { tone: 'draft', label: PRODUCT_STATUS_LABELS.draft };
}

export const AVAILABILITY_BADGE_CLASSES: Record<AvailabilityTone, string> = {
  available: 'bg-brand-600 text-white',
  soon: 'bg-accent-400 text-charcoal',
  reserved: 'bg-offwhite text-charcoal',
  soldout: 'bg-charcoal/80 text-white',
  draft: 'bg-offwhite text-charcoal/70',
};

/* ------------------------------------------------------------------ */
/*  Options de filtres                                                 */
/* ------------------------------------------------------------------ */

export const PRICE_RANGES = [
  { id: 'lt1', label: 'Moins de 1 $', min: 0, max: 1 },
  { id: '1-10', label: '1 – 10 $', min: 1, max: 10 },
  { id: '10-50', label: '10 – 50 $', min: 10, max: 50 },
  { id: 'gt50', label: 'Plus de 50 $', min: 50, max: Infinity },
] as const;

export const QUANTITY_OPTIONS = [
  { id: '100', label: '100 kg et +', kg: 100 },
  { id: '500', label: '500 kg et +', kg: 500 },
  { id: '1000', label: '1 tonne et +', kg: 1000 },
  { id: '5000', label: '5 tonnes et +', kg: 5000 },
] as const;

export const AVAILABILITY_OPTIONS = [
  { id: 'now', label: 'Disponible maintenant' },
  { id: 'soon', label: 'Bientôt disponible' },
] as const;

export const SORT_OPTIONS = [
  { id: 'recent', label: 'Plus récents' },
  { id: 'price_asc', label: 'Prix croissant' },
  { id: 'price_desc', label: 'Prix décroissant' },
] as const;

const KG_PER_UNIT: Record<string, number> = { kg: 1, tonne: 1000, sac_50kg: 50, sac_100kg: 100 };

/** Quantité ramenée en kg quand l'unité le permet (litre / sac : valeur brute). */
export function comparableQuantity(quantity: number, unit: string): number {
  return quantity * (KG_PER_UNIT[unit] ?? 1);
}

/* ------------------------------------------------------------------ */
/*  État des filtres (synchronisé avec l'URL)                          */
/* ------------------------------------------------------------------ */

export interface MarketFilters {
  q: string;
  type: string;
  category: string;
  province: string;
  price: string;
  avail: string;
  qty: string;
  sort: string;
}

export const FILTER_KEYS: (keyof MarketFilters)[] = ['q', 'type', 'category', 'province', 'price', 'avail', 'qty', 'sort'];

export function parseFilters(sp: URLSearchParams): MarketFilters {
  return {
    q: sp.get('q') ?? '',
    type: sp.get('type') ?? '',
    category: sp.get('category') ?? '',
    province: sp.get('province') ?? '',
    price: sp.get('price') ?? '',
    avail: sp.get('avail') ?? '',
    qty: sp.get('qty') ?? '',
    sort: sp.get('sort') ?? 'recent',
  };
}

/** Nombre de filtres avancés actifs (hors recherche, puce de catégorie et tri). */
export function countAdvancedFilters(f: MarketFilters): number {
  return [f.province, f.price, f.avail, f.qty, f.category].filter(Boolean).length;
}

export function hasAnyFilter(f: MarketFilters): boolean {
  return !!(f.q || f.type || countAdvancedFilters(f));
}

/* ------------------------------------------------------------------ */
/*  Application des filtres                                            */
/* ------------------------------------------------------------------ */

function categoryLabel(id: string): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export function categoryName(id: string): string {
  return categoryLabel(id);
}

function searchHaystack(p: ProductWithProfile): string {
  return normalize(
    [
      p.name,
      p.variety,
      categoryLabel(p.category),
      p.category,
      p.city,
      p.province,
      p.profiles?.full_name,
      getAvailability(p).label,
      p.description,
    ].filter(Boolean).join(' '),
  );
}

export function applyFilters(products: ProductWithProfile[], f: MarketFilters): ProductWithProfile[] {
  const tokens = normalize(f.q).split(/\s+/).filter(Boolean);
  const chip = MARKET_CHIPS.find((c) => c.id === f.type);
  const price = PRICE_RANGES.find((r) => r.id === f.price);
  const qty = QUANTITY_OPTIONS.find((o) => o.id === f.qty);
  const today = todayISO();

  const list = products.filter((p) => {
    if (tokens.length) {
      const hay = searchHaystack(p);
      if (!tokens.every((t) => hay.includes(t))) return false;
    }
    if (chip) {
      const byName = chip.names?.some((n) => normalize(p.name).includes(n));
      const byCategory = chip.category ? p.category === chip.category : false;
      if (!byName && !byCategory) return false;
    }
    if (f.category && p.category !== f.category) return false;
    if (f.province && p.province !== f.province) return false;
    if (price && !(p.price >= price.min && p.price < price.max)) return false;
    if (qty && comparableQuantity(p.quantity, p.unit) < qty.kg) return false;
    if (f.avail === 'now' && p.availability_date && p.availability_date > today) return false;
    if (f.avail === 'soon' && !(p.availability_date && p.availability_date > today)) return false;
    return true;
  });

  if (f.sort === 'price_asc') return [...list].sort((a, b) => a.price - b.price);
  if (f.sort === 'price_desc') return [...list].sort((a, b) => b.price - a.price);
  return list; // déjà trié par date de création décroissante côté serveur
}
