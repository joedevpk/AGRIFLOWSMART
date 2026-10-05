/**
 * Agri-Match — correspondance BESOIN ACHETEUR ↔ OFFRE PRODUCTEUR.
 *
 * Règles (simples, explicables) :
 *  - Le PRODUIT doit correspondre : sans cela, le score est 0 et l'offre n'est jamais proposée.
 *  - Les quantités sont comparées dans la même unité (kg, tonne, sac de 50/100 kg) ;
 *    deux unités non convertibles (litre, sac) ne sont comparées que si elles sont identiques.
 *  - Localisation : même ville > même province > information manquante.
 *  - Budget : comparé au coût de la quantité demandée au prix du producteur.
 *  - Disponibilité : date de disponibilité de l'offre vs date souhaitée.
 *
 * Le score est INDICATIF : il n'est ni une garantie ni une probabilité de vente.
 * Chaque critère renvoie une phrase qui explique pourquoi le producteur correspond (ou non).
 */

export interface MatchRequestInput {
  product_name: string;
  quantity: number;
  unit?: string | null;
  city: string | null;
  province?: string | null;
  budget: number | null;
  desired_date?: string | null;
}

export interface MatchProductInput {
  name: string;
  quantity: number;
  unit?: string | null;
  city: string | null;
  province?: string | null;
  price: number;
  availability_date?: string | null;
}

export interface MatchReason {
  label: string;
  matched: boolean;
}

export interface MatchResult {
  score: number;
  reasons: MatchReason[];
}

const UNIT_TO_KG: Record<string, number> = { kg: 1, tonne: 1000, sac_50kg: 50, sac_100kg: 100 };
const UNIT_SHORT: Record<string, string> = { kg: 'kg', tonne: 't', sac_50kg: 'sac(s) de 50 kg', sac_100kg: 'sac(s) de 100 kg', litre: 'L', sac: 'sac(s)' };

export function normalizeText(value: string | null | undefined): string {
  return (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function productNamesMatch(a: string, b: string): boolean {
  const x = normalizeText(a);
  const y = normalizeText(b);
  if (!x || !y) return false;
  return x.includes(y) || y.includes(x);
}

function toKg(quantity: number, unit: string | null | undefined): number | null {
  const factor = UNIT_TO_KG[unit ?? 'kg'];
  return factor === undefined ? null : quantity * factor;
}

function unitLabel(unit: string | null | undefined): string {
  return UNIT_SHORT[unit ?? 'kg'] ?? (unit ?? 'kg');
}

function fmt(n: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n);
}

/** Quantité de l'offre exprimée dans l'unité de la demande, ou null si non comparable. */
function comparableQuantities(request: MatchRequestInput, product: MatchProductInput): { wanted: number; offered: number; unit: string } | null {
  const reqUnit = request.unit ?? 'kg';
  const prodUnit = product.unit ?? 'kg';
  if (reqUnit === prodUnit) return { wanted: request.quantity, offered: product.quantity, unit: reqUnit };
  const reqKg = toKg(request.quantity, reqUnit);
  const prodKg = toKg(product.quantity, prodUnit);
  if (reqKg === null || prodKg === null) return null;
  return { wanted: reqKg, offered: prodKg, unit: 'kg' };
}

export function calculateMatchScore(request: MatchRequestInput, product: MatchProductInput): MatchResult {
  const nameMatch = productNamesMatch(product.name, request.product_name);
  const reasons: MatchReason[] = [];
  let score = 0;

  reasons.push({
    label: nameMatch ? `Produit compatible : ${product.name}` : 'Produit différent de celui recherché',
    matched: nameMatch,
  });

  // Quantité (25)
  const q = comparableQuantities(request, product);
  if (!q) {
    reasons.push({ label: 'Quantité non comparable (unités différentes)', matched: false });
  } else if (q.offered >= q.wanted) {
    score += 25;
    reasons.push({ label: `Quantité suffisante : ${fmt(q.offered)} ${unitLabel(q.unit)} disponibles pour ${fmt(q.wanted)} demandés`, matched: true });
  } else if (q.offered >= q.wanted * 0.5) {
    score += 12;
    reasons.push({ label: `Quantité partielle : ${fmt(q.offered)} ${unitLabel(q.unit)} disponibles sur ${fmt(q.wanted)} demandés`, matched: false });
  } else {
    reasons.push({ label: `Quantité insuffisante : ${fmt(q.offered)} ${unitLabel(q.unit)} disponibles sur ${fmt(q.wanted)} demandés`, matched: false });
  }

  // Localisation (20)
  const reqCity = normalizeText(request.city);
  const prodCity = normalizeText(product.city);
  const reqProv = normalizeText(request.province);
  const prodProv = normalizeText(product.province);
  if (reqCity && prodCity && reqCity === prodCity) {
    score += 20;
    reasons.push({ label: `Même ville : ${product.city}`, matched: true });
  } else if (reqProv && prodProv && reqProv === prodProv) {
    score += 14;
    reasons.push({ label: `Même province : ${product.province}`, matched: true });
  } else if ((!reqCity && !reqProv) || (!prodCity && !prodProv)) {
    score += 8;
    reasons.push({ label: 'Localisation non précisée', matched: false });
  } else {
    reasons.push({ label: `Zone différente : ${product.city || product.province || '—'}`, matched: false });
  }

  // Budget (15)
  if (request.budget && request.budget > 0 && product.price > 0) {
    const prodUnit = product.unit ?? 'kg';
    const reqKg = toKg(request.quantity, request.unit ?? 'kg');
    const unitKg = UNIT_TO_KG[prodUnit];
    const unitsNeeded = reqKg !== null && unitKg !== undefined ? reqKg / unitKg : request.quantity;
    const cost = product.price * unitsNeeded;
    if (cost <= request.budget) {
      score += 15;
      reasons.push({ label: `Budget compatible : coût estimé ${fmt(cost)} pour un budget de ${fmt(request.budget)}`, matched: true });
    } else if (cost <= request.budget * 1.1) {
      score += 8;
      reasons.push({ label: `Budget légèrement dépassé : coût estimé ${fmt(cost)} pour un budget de ${fmt(request.budget)}`, matched: false });
    } else {
      reasons.push({ label: `Budget dépassé : coût estimé ${fmt(cost)} pour un budget de ${fmt(request.budget)}`, matched: false });
    }
  } else {
    score += 7;
    reasons.push({ label: 'Budget non précisé', matched: false });
  }

  // Disponibilité (10)
  const avail = product.availability_date;
  if (!avail) {
    score += 10;
    reasons.push({ label: 'Disponible maintenant', matched: true });
  } else if (request.desired_date && avail <= request.desired_date) {
    score += 10;
    reasons.push({ label: 'Disponible avant la date souhaitée', matched: true });
  } else if (!request.desired_date) {
    score += 5;
    reasons.push({ label: 'Disponible à partir d\'une date ultérieure', matched: false });
  } else {
    reasons.push({ label: 'Disponible après la date souhaitée', matched: false });
  }

  // Sans produit compatible, il n'y a pas de correspondance.
  return { score: nameMatch ? Math.min(100, score + 30) : 0, reasons };
}

/** Meilleure offre disponible d'un producteur pour une demande (score > 0 uniquement). */
export function bestOfferForRequest<T extends MatchProductInput & { status?: string }>(
  request: MatchRequestInput,
  products: T[],
): { product: T; result: MatchResult } | null {
  let best: { product: T; result: MatchResult } | null = null;
  for (const product of products) {
    if (product.status && product.status !== 'available') continue;
    const result = calculateMatchScore(request, product);
    if (result.score > 0 && (!best || result.score > best.result.score)) best = { product, result };
  }
  return best;
}
