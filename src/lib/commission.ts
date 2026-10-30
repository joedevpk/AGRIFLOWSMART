/**
 * Passe 1 — Moteur de commissions : miroir TypeScript du calcul serveur.
 *
 * ⚠ La source de vérité reste la base (fonction SQL `_commission_amount`, trigger
 * `orders_commission_snapshot`). Ce module sert UNIQUEMENT à expliquer/afficher un calcul
 * et à valider les saisies ; il ne détermine jamais un montant facturé ni un taux appliqué.
 *
 * Arithmétique : entiers (BigInt) en centièmes de l'unité monétaire + taux en points de base
 * (100 pb = 1 %). Aucune multiplication flottante. Arrondi : demi vers le haut (montants positifs),
 * identique à `round(numeric, 2)` de PostgreSQL.
 *
 * Formule : commission = arrondi_centième(assiette × taux_pb ÷ 10 000), assiette = montant des PRODUITS
 * (hors livraison, hors frais de paiement). Net producteur = assiette − commission.
 */

export type CommissionStatus = 'computed' | 'not_configured' | 'legacy';
export type RefundCommissionPolicy = 'proportional' | 'keep_all' | null;

export const MAX_RATE_BPS = 10_000;

/** Convertit un montant (≤ 2 décimales) en centièmes entiers, sans erreur d'arrondi flottant. */
export function toMinor(value: number | string): bigint {
  const s = typeof value === 'number' ? (Number.isFinite(value) ? value.toFixed(2) : '') : value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new RangeError(`Montant invalide : ${String(value)}`);
  const [int, dec = ''] = s.split('.');
  return BigInt(int) * 100n + BigInt(dec.padEnd(2, '0'));
}

export function fromMinor(minor: bigint): number {
  return Number(minor) / 100;
}

export function assertRateBps(rateBps: number): void {
  if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > MAX_RATE_BPS) {
    throw new RangeError(`Taux invalide : ${String(rateBps)} (entier entre 0 et ${MAX_RATE_BPS} points de base)`);
  }
}

/** Commission en centièmes : (assiette × taux + 5 000) ÷ 10 000, division entière (demi vers le haut). */
export function commissionMinor(baseMinor: bigint, rateBps: number): bigint {
  assertRateBps(rateBps);
  if (baseMinor < 0n) throw new RangeError('Assiette négative');
  return (baseMinor * BigInt(rateBps) + 5_000n) / 10_000n;
}

export function computeCommission(itemsSubtotal: number | string, rateBps: number): number {
  return fromMinor(commissionMinor(toMinor(itemsSubtotal), rateBps));
}

export interface OrderAmounts {
  itemsSubtotal: number;
  deliveryFee: number;
  /** Total demandé à l'acheteur : produits + livraison. La commission n'est PAS ajoutée. */
  buyerTotal: number;
  /** `null` si aucune règle n'a été approuvée au moment de la commande. */
  platformCommission: number | null;
  producerNet: number | null;
}

/** Décomposition d'une commande pour affichage/test. Frais de paiement : non suivis (jamais inventés). */
export function splitOrderAmounts(input: { itemsSubtotal: number | string; deliveryFee?: number | string; rateBps: number | null }): OrderAmounts {
  const items = toMinor(input.itemsSubtotal);
  const delivery = toMinor(input.deliveryFee ?? 0);
  const commission = input.rateBps === null ? null : commissionMinor(items, input.rateBps);
  return {
    itemsSubtotal: fromMinor(items),
    deliveryFee: fromMinor(delivery),
    buyerTotal: fromMinor(items + delivery),
    platformCommission: commission === null ? null : fromMinor(commission),
    producerNet: commission === null ? null : fromMinor(items - commission),
  };
}

/** Remboursement : commission annulée selon la politique figée sur la commande (null = non décidée). */
export function commissionReversedOnRefund(args: { commission: number | string; base: number | string; refunded: number | string; policy: RefundCommissionPolicy }): number | null {
  if (args.policy === null) return null;
  if (args.policy === 'keep_all') return 0;
  const base = toMinor(args.base);
  if (base === 0n) return 0;
  const refundedItems = toMinor(args.refunded) < base ? toMinor(args.refunded) : base;
  // round(commission × min(remboursé, assiette) ÷ assiette) — demi vers le haut
  return fromMinor((toMinor(args.commission) * refundedItems * 2n + base) / (base * 2n));
}

/** Saisie administrateur « 7,5 » ou « 7.5 » (en %) → points de base entiers, exactement. */
export function percentToBps(input: string): number {
  const s = input.trim().replace(',', '.');
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) throw new RangeError('Saisissez un pourcentage avec au plus 2 décimales (ex. 7,5).');
  const [int, dec = ''] = s.split('.');
  const bps = Number(int) * 100 + Number(dec.padEnd(2, '0'));
  assertRateBps(bps);
  return bps;
}

export function bpsToPercentLabel(rateBps: number): string {
  assertRateBps(rateBps);
  const int = Math.floor(rateBps / 100);
  const dec = String(rateBps % 100).padStart(2, '0').replace(/0$/, '');
  return `${int}${dec === '' || dec === '0' ? '' : ',' + dec} %`;
}

export const COMMISSION_STATUS_LABELS: Record<CommissionStatus, string> = {
  computed: 'Calculée',
  not_configured: 'Non configurée',
  legacy: 'Ancienne méthode',
};

/** Explique à un administrateur POURQUOI une commande a reçu (ou non) une commission. */
export function explainCommission(o: { status: CommissionStatus; rateBps: number | null; base: number | null; commission: number | null; currency: string; ruleId?: string | null }): string {
  if (o.status === 'not_configured') return 'Aucune règle de commission approuvée au moment de la commande : commission 0 et net producteur non calculé (règlement en attente de décision).';
  if (o.status === 'legacy') return 'Commande payée avant la mise en place du moteur : montants calculés par l\'ancienne méthode (taux non tracé), conservés tels quels.';
  if (o.rateBps === null || o.base === null || o.commission === null) return 'Données de calcul incomplètes.';
  return `Règle ${o.ruleId ? o.ruleId.slice(0, 8) : ''} figée à la commande : ${o.base} ${o.currency} × ${bpsToPercentLabel(o.rateBps)} = ${o.commission} ${o.currency} (arrondi au centième, demi vers le haut ; livraison et frais de paiement exclus).`.replace('Règle  ', 'Règle ');
}
