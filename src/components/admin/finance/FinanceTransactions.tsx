import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Download, Receipt } from 'lucide-react';
import { Badge, Button, Card, CardBody, EmptyState, ErrorState, Input, LoadingState, Select } from '@/components/ui';
import { toast } from '@/components/ui/toast-store';
import { formatDate, formatDateTime, formatPrice } from '@/lib/constants';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/logger';
import { downloadTextFile } from '@/lib/native/files';
import { buildCsv, PAYMENT_STATUS_LABELS, REVIEW_LABELS, TX_CSV_COLUMNS, type TxRow } from '@/lib/finance';

interface Props { period: { from: string; to: string } | null; currency: string; openOrderId: string | null; onOpened: () => void }
interface Detail {
  transaction: TxRow;
  order: { commission_rate_bps: number | null; commission_base: number | null; commission_reversed: number | null; commission_refund_policy: string | null; settlement_status: string };
  payments: { id: string; internal_reference: string | null; provider_transaction_id: string | null; status: string; provider_status: string | null; amount: number; currency: string; method: string; is_demo: boolean; created_at: string; paid_at: string | null; failure_reason: string | null }[];
  payment_events: { id: string; event_type: string; provider_status: string | null; processed: boolean; result_code: string | null; created_at: string }[];
  refunds: { id: string; amount: number; currency: string; status: string; created_at: string; updated_at: string }[];
  financial_events: { id: string; occurred_at: string; event_type: string; amount: number | null; currency: string | null }[];
}
const PAGE_SIZE = 25;
const PAY_OPTIONS = [{ value: '', label: 'Tous les statuts' }, ...['paid', 'pending', 'processing', 'failed', 'cancelled', 'expired', 'refunded'].map((v) => ({ value: v, label: PAYMENT_STATUS_LABELS[v] }))];

export function FinanceTransactions({ period, currency, openOrderId, onOpened }: Props) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [review, setReview] = useState(false);
  const [inPeriod, setInPeriod] = useState(true);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<TxRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const trimmed = q.trim();
  const qInvalid = trimmed.length === 1;

  const args = useCallback(() => ({
    p_q: trimmed.length >= 2 ? trimmed : null, p_payment_status: status || null, p_review: review, p_currency: currency,
    p_from: inPeriod && period ? period.from : null, p_to: inPeriod && period ? period.to : null,
  }), [trimmed, status, review, currency, inPeriod, period]);

  const load = useCallback(async () => {
    if (qInvalid) return;
    setLoading(true); setFailed(null);
    const { data, error } = await supabase.rpc('admin_transactions_search', { ...args(), p_page: page, p_page_size: PAGE_SIZE });
    if (error) { reportError('FinanceTransactions.search', error.message); setFailed('Impossible de charger les transactions.'); setLoading(false); return; }
    const res = data as { rows: TxRow[]; total: number };
    setRows(res.rows); setTotal(res.total); setLoading(false);
  }, [args, page, qInvalid]);

  useEffect(() => { setPage(1); }, [trimmed, status, review, inPeriod, currency, period?.from, period?.to]);
  useEffect(() => { const t = setTimeout(() => void load(), trimmed ? 300 : 0); return () => clearTimeout(t); }, [load, trimmed]);

  const openDetail = useCallback(async (orderId: string) => {
    setDetailBusy(true);
    const { data, error } = await supabase.rpc('admin_transaction_detail', { p_order_id: orderId });
    setDetailBusy(false);
    if (error) { reportError('FinanceTransactions.detail', error.message); toast('error', 'Impossible de charger le détail.'); return; }
    setDetail(data as Detail);
  }, []);

  useEffect(() => { if (openOrderId) { void openDetail(openOrderId); onOpened(); } }, [openOrderId, openDetail, onOpened]);

  const exportCsv = async () => {
    setExporting(true);
    const { data, error } = await supabase.rpc('admin_transactions_export', { ...args(), p_limit: 5000 });
    setExporting(false);
    if (error) { reportError('FinanceTransactions.export', error.message); toast('error', 'Export impossible ou non autorisé.'); return; }
    const res = data as { rows: Record<string, unknown>[]; row_count: number; truncated: boolean };
    try {
      await downloadTextFile({ filename: `agriflow-transactions-${new Date().toISOString().slice(0, 10)}.csv`, mimeType: 'text/csv;charset=utf-8', content: buildCsv(res.rows, TX_CSV_COLUMNS), shareTitle: 'Transactions AgriFlow RDC' });
    } catch (err) {
      reportError('FinanceTransactions.save', err instanceof Error ? err.message : 'save failed');
      toast('error', 'Le fichier n\'a pas pu être enregistré sur cet appareil.');
      return;
    }
    toast('success', res.truncated ? `Export de ${res.row_count} lignes (limite atteinte : affinez les filtres).` : `Export de ${res.row_count} ligne(s) terminé.`);
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input label="Rechercher" placeholder="N° de commande, référence, utilisateur" value={q} onChange={(e) => setQ(e.target.value)} error={qInvalid ? 'Saisissez au moins 2 caractères.' : undefined} />
        <Select label="Statut du paiement" value={status} onChange={(e) => setStatus(e.target.value)} options={PAY_OPTIONS} />
        <label className="flex min-h-[44px] items-center gap-2 self-end text-sm text-charcoal"><input type="checkbox" className="h-5 w-5 accent-brand-600" checked={inPeriod} onChange={(e) => setInPeriod(e.target.checked)} />Limiter à la période</label>
        <label className="flex min-h-[44px] items-center gap-2 self-end text-sm text-charcoal"><input type="checkbox" className="h-5 w-5 accent-brand-600" checked={review} onChange={(e) => setReview(e.target.checked)} />À vérifier uniquement</label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-charcoal/60" aria-live="polite">{loading ? 'Chargement…' : `${total} transaction${total > 1 ? 's' : ''} · devise ${currency}`}</p>
        <Button variant="outline" size="sm" onClick={() => void exportCsv()} loading={exporting} disabled={qInvalid || total === 0}><Download className="h-4 w-4" aria-hidden="true" />Exporter en CSV</Button>
      </div>

      {failed ? <ErrorState message={failed} onRetry={() => void load()} /> : loading && rows.length === 0 ? <LoadingState /> : rows.length === 0 ? (
        <Card><CardBody><EmptyState icon={<Receipt className="h-8 w-8" />} title="Aucune transaction" description="Aucune commande ne correspond à ces filtres." /></CardBody></Card>
      ) : (
        <Card><CardBody className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-black/[0.06] text-xs text-charcoal/50"><tr>
            <th scope="col" className="px-4 py-3 font-medium">Commande</th><th scope="col" className="px-4 py-3 font-medium">Date</th><th scope="col" className="px-4 py-3 font-medium">Paiement</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Total acheteur</th><th scope="col" className="px-4 py-3 text-right font-medium">Commission</th><th scope="col" className="px-4 py-3 font-medium">Contrôle</th></tr></thead>
          <tbody className="divide-y divide-black/[0.06]">{rows.map((r) => (
            <tr key={r.order_id} className={detail?.transaction.order_id === r.order_id ? 'bg-brand-50/60' : undefined}>
              <td className="px-4 py-3"><button type="button" onClick={() => void openDetail(r.order_id)} className="min-h-[44px] font-medium tabular-nums text-brand-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">{r.order_number ?? r.order_id.slice(0, 8)}</button></td>
              <td className="px-4 py-3 text-charcoal/60">{formatDate(r.created_at)}</td>
              <td className="px-4 py-3">{PAYMENT_STATUS_LABELS[r.payment_status] ?? r.payment_status}{r.refunded_amount > 0 ? <span className="text-xs text-charcoal/55"> · remb. {formatPrice(r.refunded_amount, r.currency)}</span> : null}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatPrice(r.buyer_total, r.currency)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{r.commission_status === 'not_configured' ? <Badge variant="warning">Non configurée</Badge> : r.platform_commission === null ? '—' : formatPrice(r.platform_commission, r.currency)}</td>
              <td className="px-4 py-3">{r.review_reasons.length > 0 ? <span className="inline-flex items-center gap-1 text-xs text-amber-800"><AlertTriangle className="h-4 w-4" aria-hidden="true" />{r.review_reasons.length} à vérifier</span> : <span className="text-xs text-charcoal/40">—</span>}</td>
            </tr>))}</tbody>
        </table></div></CardBody></Card>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-between gap-3" aria-label="Pagination des transactions">
          <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>Précédent</Button>
          <span className="text-sm text-charcoal/60">Page {page} sur {pages}</span>
          <Button variant="outline" size="sm" disabled={page >= pages || loading} onClick={() => setPage((p) => p + 1)}>Suivant</Button>
        </nav>
      )}

      {detailBusy && <LoadingState />}
      {detail && !detailBusy && <DetailPanel d={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function DetailPanel({ d, onClose }: { d: Detail; onClose: () => void }) {
  const t = d.transaction;
  const m = (n: number | null | undefined) => (n === null || n === undefined ? '—' : formatPrice(n, t.currency));
  return (
    <Card><CardBody className="space-y-4">
      <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-charcoal">Transaction {t.order_number}</h3><Button size="sm" variant="ghost" onClick={onClose}>Fermer</Button></div>
      {t.review_reasons.length > 0 && <ul className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">{t.review_reasons.map((r) => <li key={r}>⚠ {REVIEW_LABELS[r] ?? r}</li>)}</ul>}
      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        {([
          ['Produits', m(t.items_subtotal)], ['Livraison', m(t.delivery_fee)], ['Total acheteur', m(t.buyer_total)], ['Frais de paiement', 'Non suivis'],
          ['Commission', t.commission_status === 'not_configured' ? 'Non configurée' : m(t.platform_commission)], ['Net producteur', m(t.producer_net)],
          ['Remboursé', m(t.refunded_amount)], ['Commission annulée', d.order.commission_reversed === null ? 'À arbitrer' : m(d.order.commission_reversed)],
          ['Acheteur', t.buyer_name ?? '—'], ['Vendeur', t.producer_name ?? '—'], ['Règlement', d.order.settlement_status], ['Taux figé', d.order.commission_rate_bps === null ? '—' : `${d.order.commission_rate_bps / 100} %`],
        ] as const).map(([k, v]) => <div key={k} className="rounded-xl border border-black/[0.06] bg-offwhite px-3 py-2"><dt className="text-xs text-charcoal/50">{k}</dt><dd className="break-words font-medium tabular-nums text-charcoal">{v}</dd></div>)}
      </dl>
      <Section title="Paiements">{d.payments.map((p) => <li key={p.id} className="flex flex-wrap justify-between gap-x-3 px-3 py-2"><span>{PAYMENT_STATUS_LABELS[p.status] ?? p.status}{p.is_demo ? ' (démo)' : ''} · {p.method} · {p.internal_reference ?? '—'}{p.provider_transaction_id ? ` · ${p.provider_transaction_id}` : ''}</span><span className="text-xs text-charcoal/55">{formatPrice(p.amount, p.currency)} · {formatDateTime(p.paid_at ?? p.created_at)}</span></li>)}</Section>
      <Section title="Événements de paiement">{d.payment_events.map((e) => <li key={e.id} className="flex flex-wrap justify-between gap-x-3 px-3 py-2"><span>{e.event_type}{e.provider_status ? ` · ${e.provider_status}` : ''}{e.result_code ? ` · ${e.result_code}` : ''}</span><span className="text-xs text-charcoal/55">{e.processed ? 'traité' : 'non traité'} · {formatDateTime(e.created_at)}</span></li>)}</Section>
      <Section title="Remboursements">{d.refunds.map((r) => <li key={r.id} className="flex flex-wrap justify-between gap-x-3 px-3 py-2"><span>{r.status}</span><span className="text-xs text-charcoal/55">{formatPrice(r.amount, r.currency)} · {formatDateTime(r.updated_at)}</span></li>)}</Section>
      <Section title="Journal comptable">{d.financial_events.map((e) => <li key={e.id} className="flex flex-wrap justify-between gap-x-3 px-3 py-2"><span>{e.event_type}</span><span className="text-xs text-charcoal/55">{e.amount === null ? '' : `${formatPrice(e.amount, e.currency ?? t.currency)} · `}{formatDateTime(e.occurred_at)}</span></li>)}</Section>
    </CardBody></Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children : [children];
  return (
    <div><h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-charcoal/50">{title}</h4>
      {items.length === 0 ? <p className="rounded-xl border border-dashed border-black/10 px-3 py-2 text-xs text-charcoal/50">Aucun élément.</p> : <ul className="divide-y divide-black/[0.06] rounded-xl border border-black/[0.06] text-sm">{children}</ul>}
    </div>
  );
}
