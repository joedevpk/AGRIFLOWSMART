/**
 * Passe 2 — Dashboard financier : périodes (heure de Kinshasa), CSV sûr, libellés.
 * Les calculs financiers eux-mêmes sont faits côté serveur (RPC admin_finance_*) ; ce module ne calcule aucun montant.
 */

/** Kinshasa = UTC+1, sans heure d'été. Les bornes envoyées au serveur sont des instants précis. */
export const KINSHASA_OFFSET = '+01:00';
const OFFSET_HOURS = 1;
export const MAX_PERIOD_DAYS = 800;

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const ymdToUtcMs = (ymd: string): number => Date.parse(`${ymd}T00:00:00Z`);
const msToYmd = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export function isValidYmd(v: string): boolean {
  return YMD.test(v) && msToYmd(ymdToUtcMs(v)) === v;
}

export function addDays(ymd: string, n: number): string {
  return msToYmd(ymdToUtcMs(ymd) + n * 86_400_000);
}

/** Date du jour à Kinshasa (YYYY-MM-DD), indépendante du fuseau du navigateur. */
export function kinshasaToday(now: Date = new Date()): string {
  return msToYmd(now.getTime() + OFFSET_HOURS * 3_600_000);
}

/** Nombre de jours calendaires inclus entre deux dates. */
export function periodDays(fromYmd: string, toYmd: string): number {
  return Math.round((ymdToUtcMs(toYmd) - ymdToUtcMs(fromYmd)) / 86_400_000) + 1;
}

export function validatePeriod(fromYmd: string, toYmd: string): string | null {
  if (!isValidYmd(fromYmd) || !isValidYmd(toYmd)) return 'Choisissez une date de début et une date de fin valides.';
  if (toYmd < fromYmd) return 'La date de fin doit être postérieure ou égale à la date de début.';
  if (periodDays(fromYmd, toYmd) > MAX_PERIOD_DAYS) return `La période ne peut pas dépasser ${MAX_PERIOD_DAYS} jours.`;
  return null;
}

/** Dates inclusives (jour de début, jour de fin) → instants [début, fin[ à minuit heure de Kinshasa. */
export function periodFromDates(fromYmd: string, toYmd: string): { from: string; to: string } {
  const err = validatePeriod(fromYmd, toYmd);
  if (err) throw new RangeError(err);
  return { from: `${fromYmd}T00:00:00${KINSHASA_OFFSET}`, to: `${addDays(toYmd, 1)}T00:00:00${KINSHASA_OFFSET}` };
}

export type PeriodPreset = '7d' | '30d' | '90d' | 'month' | 'prevMonth';
export const PRESET_LABELS: Record<PeriodPreset, string> = {
  '7d': '7 jours', '30d': '30 jours', '90d': '90 jours', month: 'Ce mois', prevMonth: 'Mois dernier',
};

export function presetDates(preset: PeriodPreset, now: Date = new Date()): { from: string; to: string } {
  const today = kinshasaToday(now);
  const firstOfMonth = `${today.slice(0, 7)}-01`;
  switch (preset) {
    case '7d': return { from: addDays(today, -6), to: today };
    case '30d': return { from: addDays(today, -29), to: today };
    case '90d': return { from: addDays(today, -89), to: today };
    case 'month': return { from: firstOfMonth, to: today };
    case 'prevMonth': { const lastPrev = addDays(firstOfMonth, -1); return { from: `${lastPrev.slice(0, 7)}-01`, to: lastPrev }; }
  }
}

export type Granularity = 'day' | 'week' | 'month';
/** Évite des centaines de barres illisibles : jour ≤ 62 j, semaine ≤ 400 j, sinon mois. */
export function autoGranularity(days: number): Granularity {
  return days <= 62 ? 'day' : days <= 400 ? 'week' : 'month';
}

// ---------------------------------------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------------------------------------
export interface CsvColumn { key: string; label: string }

/**
 * Neutralise l'injection de formules (Excel / LibreOffice) : une cellule texte commençant par = + - @ (ou tabulation / retour chariot)
 * est préfixée par une apostrophe. Les nombres (type number) ne sont jamais préfixés.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s: string;
  if (typeof value === 'number') s = Number.isFinite(value) ? String(value) : '';
  else if (typeof value === 'boolean') s = value ? 'oui' : 'non';
  else if (Array.isArray(value)) s = value.map((v) => String(v)).join(' | ');
  else s = String(value);
  if (typeof value !== 'number' && /^[\s]*[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV UTF-8 avec BOM (ouverture correcte dans Excel), séparateur virgule, fins de ligne CRLF. */
export function buildCsv(rows: Record<string, unknown>[], columns: CsvColumn[]): string {
  const head = columns.map((c) => csvCell(c.label)).join(',');
  const lines = rows.map((r) => columns.map((c) => csvCell(r[c.key])).join(','));
  return '\uFEFF' + [head, ...lines].join('\r\n') + '\r\n';
}

export const TX_CSV_COLUMNS: CsvColumn[] = [
  { key: 'order_number', label: 'Commande' },
  { key: 'created_at', label: 'Date de création (UTC)' },
  { key: 'order_status', label: 'Statut commande' },
  { key: 'payment_status', label: 'Statut paiement' },
  { key: 'payment_reference', label: 'Référence paiement' },
  { key: 'provider_transaction_id', label: 'Référence prestataire' },
  { key: 'currency', label: 'Devise' },
  { key: 'items_subtotal', label: 'Produits' },
  { key: 'delivery_fee', label: 'Livraison' },
  { key: 'buyer_total', label: 'Total acheteur' },
  { key: 'commission_status', label: 'Statut commission' },
  { key: 'platform_commission', label: 'Commission' },
  { key: 'producer_net', label: 'Net producteur' },
  { key: 'refunded_amount', label: 'Remboursé' },
  { key: 'review_reasons', label: 'À vérifier' },
];

// ---------------------------------------------------------------------------------------------------------
// Types des réponses serveur
// ---------------------------------------------------------------------------------------------------------
export interface CurrencySummary {
  orders_count: number; orders_value: number; cancelled_count: number; cancelled_value: number; delivery_fees: number;
  payments_pending_count: number; payments_pending_amount: number; payments_failed_count: number; payments_failed_amount: number;
  payments_paid_count: number; payments_refunded_full_count: number;
  collected: number; collected_count: number; refunded: number; refunded_count: number; net_collected: number;
  refunds_open_count: number; refunds_open_amount: number;
  commission_gross: number; commission_reversed: number; commission_earned: number; paid_without_commission: number;
  producers_due_estimate: number; producers_due_orders: number; due_needs_arbitration: number; on_hold_orders: number;
}
export interface FinanceSummary {
  period: { from: string; to: string; timezone: string };
  currencies: Record<string, CurrencySummary>;
  demo_payments_excluded: number;
  payouts: { available: boolean; reason: string };
  net_profit: { available: boolean; reason: string };
  payment_fees: { available: boolean; reason: string };
}
export interface SeriesRow { bucket: string; orders_count: number; orders_value: number; collected: number; refunded: number; commission_earned: number }
export interface BreakdownRow { key: string; label: string; orders_count: number; items_value: number; commission_earned: number | null }
export type ReviewReason = 'payment_order_mismatch' | 'order_paid_without_payment' | 'amount_mismatch' | 'commission_not_configured' | 'refund_total_mismatch' | 'refund_stuck' | 'payment_stale';
export interface TxRow {
  order_id: string; order_number: string | null; created_at: string; order_status: string; payment_status: string;
  payment_id: string | null; payment_reference: string | null; provider_transaction_id: string | null; payment_row_status: string | null;
  payment_amount: number | null; is_demo: boolean | null; currency: string; items_subtotal: number; delivery_fee: number; buyer_total: number;
  commission_status: string; platform_commission: number | null; producer_net: number | null; refunded_amount: number;
  buyer_name: string | null; producer_name: string | null; review_reasons: ReviewReason[];
}
export interface ReconItem { kind: string; severity: 'error' | 'warning' | 'info'; order_id: string | null; payment_id: string | null; refund_id: string | null; expected: number | null; actual: number | null; currency: string | null; detail: string }
export interface ReconReport { generated_at: string; totals: Record<string, number>; errors: number; warnings: number; infos: number; items: ReconItem[]; truncated: boolean; payouts: { available: boolean; reason: string }; corrections: string }

export const REVIEW_LABELS: Record<ReviewReason, string> = {
  payment_order_mismatch: 'Paiement confirmé, commande non payée',
  order_paid_without_payment: 'Commande payée sans paiement confirmé',
  amount_mismatch: 'Montant payé ≠ total de la commande',
  commission_not_configured: 'Payée sans règle de commission',
  refund_total_mismatch: 'Cumul remboursé incohérent',
  refund_stuck: 'Remboursement en attente depuis plus de 24 h',
  payment_stale: 'Paiement en cours depuis plus de 2 h',
};
export const RECON_LABELS: Record<string, string> = {
  payment_confirmed_order_not_paid: 'Paiement confirmé, commande non payée',
  order_paid_without_payment: 'Commande payée sans paiement confirmé',
  amount_mismatch: 'Montant payé différent du total',
  currency_mismatch: 'Devise du paiement différente',
  commission_mismatch: 'Commission ≠ formule au taux figé',
  net_mismatch: 'Net producteur ≠ produits − commission',
  refund_total_mismatch: 'Cumul remboursé incohérent',
  missing_ledger_event: 'Événement comptable manquant',
  refund_stuck: 'Remboursement bloqué (> 24 h)',
  payment_stale: 'Paiement en cours (> 2 h)',
  paid_without_commission_rule: 'Payée sans règle de commission',
};
export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'En attente', processing: 'En cours', paid: 'Payé', failed: 'Échoué', cancelled: 'Annulé', expired: 'Expiré', refunded: 'Remboursé', demo_paid: 'Démo',
};
export const ADMIN_ACTION_LABELS: Record<string, string> = {
  'profile.role_changed': 'Rôle modifié', 'profile.verification_changed': 'Vérification modifiée',
  'product.status_changed': 'Statut d\'offre modifié', 'product.deleted_by_admin': 'Offre supprimée par un administrateur',
  'commission_rule.created': 'Règle de commission créée', 'commission_rule.approved': 'Règle de commission approuvée',
  'commission_rule.retired': 'Règle de commission retirée', 'export.transactions': 'Export des transactions',
};
