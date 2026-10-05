import type { CartIssue, CartItem, CartTotals, LiveProduct, StoredCartItem } from '@/types';

/**
 * Logique pure du panier (aucun accès réseau, aucun React) — testable isolément.
 *
 * RÈGLE : le navigateur n'est jamais la source de vérité du prix, du stock ni du
 * total. Ces fonctions servent à AFFICHER un panier à partir de données lues en
 * base (`LiveProduct`) ; la commande est recalculée et revalidée côté serveur par
 * la RPC `create_order_from_cart`.
 */

export const MAX_CART_LINES = 50;
export const MAX_LINE_QUANTITY = 1_000_000;

/** Arrondi monétaire à 2 décimales (identique à `round(x, 2)` côté SQL pour les valeurs positives). */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function lineSubtotal(unitPrice: number, quantity: number): number {
  return round2(unitPrice * quantity);
}

/** Quantité entière valide : NaN / négatif / zéro → 1 ; plafonnée au stock (min 1) et au maximum absolu. */
export function clampQuantity(value: number, max: number): number {
  const n = Number.isFinite(value) ? Math.floor(value) : 1;
  const cap = Math.max(1, Math.min(Math.floor(Number.isFinite(max) ? max : 1), MAX_LINE_QUANTITY));
  return Math.min(cap, Math.max(1, n));
}

export function isValidQuantity(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= MAX_LINE_QUANTITY;
}

/* ------------------------------------------------------------------ */
/*  Lecture défensive du stockage local                                */
/* ------------------------------------------------------------------ */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ne fait jamais confiance au contenu du stockage local : tout est revalidé. */
export function normalizeStoredCart(raw: unknown): StoredCartItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: StoredCartItem[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const productId = entry.product_id;
    const quantity = entry.quantity;
    if (typeof productId !== 'string' || !UUID_RE.test(productId) || seen.has(productId)) continue;
    if (!isValidQuantity(quantity)) continue;
    const snap = isRecord(entry.snapshot) ? entry.snapshot : {};
    const unitPrice = typeof snap.unit_price === 'number' && Number.isFinite(snap.unit_price) && snap.unit_price >= 0 ? snap.unit_price : 0;
    seen.add(productId);
    out.push({
      product_id: productId,
      quantity,
      added_at: typeof entry.added_at === 'string' ? entry.added_at : new Date(0).toISOString(),
      snapshot: {
        name: typeof snap.name === 'string' && snap.name ? snap.name : 'Produit',
        image: typeof snap.image === 'string' ? snap.image : null,
        unit: typeof snap.unit === 'string' && snap.unit ? snap.unit : 'kg',
        unit_price: unitPrice,
        currency: typeof snap.currency === 'string' && snap.currency ? snap.currency : 'USD',
        producer_id: typeof snap.producer_id === 'string' ? snap.producer_id : '',
        producer_name: typeof snap.producer_name === 'string' ? snap.producer_name : null,
      },
    });
    if (out.length >= MAX_CART_LINES) break;
  }
  return out;
}

/** Fusionne deux paniers (ex. panier invité → panier du compte) en additionnant les quantités. */
export function mergeStoredItems(base: StoredCartItem[], extra: StoredCartItem[]): StoredCartItem[] {
  const map = new Map<string, StoredCartItem>();
  for (const item of base) map.set(item.product_id, item);
  for (const item of extra) {
    const existing = map.get(item.product_id);
    if (existing) {
      map.set(item.product_id, { ...existing, quantity: Math.min(MAX_LINE_QUANTITY, existing.quantity + item.quantity) });
    } else {
      map.set(item.product_id, item);
    }
  }
  return Array.from(map.values()).slice(0, MAX_CART_LINES);
}

/* ------------------------------------------------------------------ */
/*  Construction des lignes à partir des données live                  */
/* ------------------------------------------------------------------ */

export type LiveProductMap = Record<string, LiveProduct | null | undefined>;

export function issueFor(item: StoredCartItem, live: LiveProduct | null | undefined, currentUserId: string | null): CartIssue | null {
  // `undefined` : pas encore vérifié (chargement) ; `null` : introuvable en base.
  if (live === undefined) return null;
  if (live === null) return 'removed';
  if (currentUserId && live.user_id === currentUserId) return 'own_product';
  if (live.status !== 'available') return 'unavailable';
  if (!(live.price > 0)) return 'price_missing';
  if (live.quantity < item.quantity) return 'insufficient_stock';
  return null;
}

export function buildCartItems(stored: StoredCartItem[], live: LiveProductMap, currentUserId: string | null): CartItem[] {
  return stored.map((item) => {
    const product = live[item.product_id];
    const issue = issueFor(item, product, currentUserId);
    // Prix affiché : celui de la base dès qu'il est connu, sinon l'instantané (affichage provisoire).
    const unitPrice = product ? product.price : item.snapshot.unit_price;
    const changed = product && product.price !== item.snapshot.unit_price && item.snapshot.unit_price > 0;
    return {
      product_id: item.product_id,
      producer_id: product?.user_id ?? item.snapshot.producer_id,
      producer_name: product?.producer_name ?? item.snapshot.producer_name,
      name: product?.name ?? item.snapshot.name,
      image: product?.image ?? item.snapshot.image,
      unit: product?.unit ?? item.snapshot.unit,
      unit_price: unitPrice,
      currency: product?.currency ?? item.snapshot.currency,
      quantity: item.quantity,
      available_quantity: product ? Math.max(0, Math.floor(product.quantity)) : 0,
      subtotal: lineSubtotal(unitPrice, item.quantity),
      issue,
      previous_price: changed ? item.snapshot.unit_price : null,
    };
  });
}

/** Les lignes en erreur ne comptent pas dans le total : elles doivent être corrigées ou retirées. */
export function computeTotals(items: CartItem[]): CartTotals {
  const valid = items.filter((i) => i.issue === null);
  const currencies = new Set(items.map((i) => i.currency));
  const subtotal = round2(valid.reduce((sum, i) => sum + i.subtotal, 0));
  return {
    currency: currencies.size === 1 ? Array.from(currencies)[0] : null,
    mixedCurrencies: currencies.size > 1,
    itemCount: items.length,
    subtotal,
    // Aucun service de livraison n'est connecté : pas de frais inventés, « à confirmer ».
    deliveryFee: null,
    total: subtotal,
    hasBlockingIssue: items.some((i) => i.issue !== null) || currencies.size > 1,
  };
}

export function issueMessage(item: Pick<CartItem, 'issue' | 'available_quantity' | 'unit'>): string | null {
  switch (item.issue) {
    case 'removed':
    case 'unavailable':
      return 'Ce produit n\'est plus disponible.';
    case 'insufficient_stock':
      return 'La quantité disponible a changé. Veuillez mettre votre panier à jour.';
    case 'own_product':
      return 'Vous ne pouvez pas commander votre propre production.';
    case 'price_missing':
      return 'Le prix de ce produit n\'est pas encore défini. Contactez le producteur.';
    default:
      return null;
  }
}

/** Signature stable du contenu du panier : sert à renouveler la clé d'idempotence si le panier change. */
export function cartSignature(items: Pick<StoredCartItem, 'product_id' | 'quantity'>[]): string {
  return items
    .map((i) => `${i.product_id}:${i.quantity}`)
    .sort()
    .join('|');
}
