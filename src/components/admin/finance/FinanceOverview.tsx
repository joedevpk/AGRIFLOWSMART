import { useEffect, useState } from 'react';
import { Banknote, Ban, Coins, Info, Receipt, RotateCcw, ShoppingBasket, Truck, Users } from 'lucide-react';
import { Badge, Card, CardBody, EmptyState, ErrorState, LoadingState, Select, StatCard } from '@/components/ui';
import { formatPrice } from '@/lib/constants';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/logger';
import type { BreakdownRow, CurrencySummary, FinanceSummary, Granularity, SeriesRow } from '@/lib/finance';
import { FinanceChart } from './FinanceChart';

interface Props { summary: FinanceSummary; currency: string; period: { from: string; to: string }; granularity: Granularity }

const METRICS = [
  { value: 'collected', label: 'Argent encaissé' }, { value: 'orders_value', label: 'Valeur des commandes' },
  { value: 'commission_earned', label: 'Commission acquise' }, { value: 'refunded', label: 'Remboursé' },
] as const;
type Metric = (typeof METRICS)[number]['value'];
const DIMENSIONS = [{ value: 'category', label: 'Catégorie de produit' }, { value: 'producer', label: 'Vendeur' }, { value: 'buyer_type', label: 'Type de clientèle' }];
const BUYER_TYPES: Record<string, string> = { restaurant: 'Restaurant', market: 'Marché / commerçant', wholesaler: 'Grossiste', agro_industry: 'Agro-industrie', enterprise: 'Entreprise' };

const DEFINITIONS: [string, string][] = [
  ['Valeur des commandes', 'Total acheteur des commandes créées dans la période, hors annulées. Ce n\'est pas de l\'argent encaissé.'],
  ['Argent encaissé', 'Paiements réels confirmés dont la date de confirmation est dans la période (démos exclus), livraison comprise. Il revient en grande partie aux producteurs : ce n\'est pas un revenu de la plateforme.'],
  ['Commission acquise', 'Commission figée sur les commandes payées dans la période, moins les commissions annulées par remboursement. Montant brut : avant frais de paiement et charges.'],
  ['Net dû aux producteurs', 'Solde à date (commandes payées, règlement en attente) : estimation. Aucun reversement n\'est automatisé dans l\'application.'],
  ['Bénéfice net', 'Non disponible : l\'application ne contient ni coûts ni frais de paiement.'],
];

export function FinanceOverview({ summary, currency, period, granularity }: Props) {
  const s: CurrencySummary | undefined = summary.currencies[currency];
  const [metric, setMetric] = useState<Metric>('collected');
  const [dimension, setDimension] = useState('category');
  const [series, setSeries] = useState<SeriesRow[] | null>(null);
  const [rows, setRows] = useState<BreakdownRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const money = (n: number) => formatPrice(n, currency);

  useEffect(() => {
    let alive = true;
    setSeries(null); setError(null);
    void supabase.rpc('admin_finance_timeseries', { p_from: period.from, p_to: period.to, p_granularity: granularity, p_currency: currency }).then(({ data, error: e }) => {
      if (!alive) return;
      if (e) { reportError('FinanceOverview.timeseries', e.message); setError('Impossible de charger l\'évolution.'); return; }
      setSeries((data as { rows: SeriesRow[] }).rows);
    });
    return () => { alive = false; };
  }, [period.from, period.to, granularity, currency]);

  useEffect(() => {
    let alive = true;
    setRows(null);
    void supabase.rpc('admin_finance_breakdown', { p_from: period.from, p_to: period.to, p_dimension: dimension, p_currency: currency }).then(({ data, error: e }) => {
      if (!alive) return;
      if (e) { reportError('FinanceOverview.breakdown', e.message); setRows([]); return; }
      setRows((data as { rows: BreakdownRow[] }).rows);
    });
    return () => { alive = false; };
  }, [period.from, period.to, dimension, currency]);

  if (!s) return <EmptyState icon={<Receipt className="h-8 w-8" />} title="Aucune donnée financière" description={`Aucune commande ni paiement en ${currency} sur cette période.`} />;
  const label = METRICS.find((m) => m.value === metric)?.label ?? '';

  return (
    <div className="space-y-8">
      <section aria-label="Indicateurs">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard label="Commandes (hors annulées)" value={`${s.orders_count} · ${money(s.orders_value)}`} icon={<ShoppingBasket className="h-5 w-5" />} />
          <StatCard label="Argent encaissé" value={money(s.collected)} icon={<Banknote className="h-5 w-5" />} accent="emerald" />
          <StatCard label="Commission acquise" value={money(s.commission_earned)} icon={<Coins className="h-5 w-5" />} accent="amber" />
          <StatCard label="Remboursé" value={money(s.refunded)} icon={<RotateCcw className="h-5 w-5" />} accent="rose" />
          <StatCard label="Net encaissé (− remboursé)" value={money(s.net_collected)} icon={<Banknote className="h-5 w-5" />} accent="blue" />
          <StatCard label="Frais de livraison" value={money(s.delivery_fees)} icon={<Truck className="h-5 w-5" />} accent="blue" />
          <StatCard label="Net estimé dû aux producteurs" value={money(s.producers_due_estimate)} icon={<Users className="h-5 w-5" />} accent="amber" />
          <StatCard label="Commandes annulées" value={`${s.cancelled_count} · ${money(s.cancelled_value)}`} icon={<Ban className="h-5 w-5" />} accent="rose" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {([
            ['Paiements confirmés', s.payments_paid_count, undefined], ['En attente / en cours', s.payments_pending_count, s.payments_pending_amount],
            ['Échoués / annulés / expirés', s.payments_failed_count, s.payments_failed_amount], ['Remboursements ouverts', s.refunds_open_count, s.refunds_open_amount],
          ] as const).map(([k, n, amt]) => (
            <div key={k} className="rounded-xl border border-black/[0.06] bg-offwhite px-3 py-2"><p className="text-xs text-charcoal/50">{k}</p><p className="font-semibold tabular-nums text-charcoal">{n}{amt !== undefined ? ` · ${money(amt)}` : ''}</p></div>
          ))}
        </div>
      </section>

      <section aria-label="Points d'attention" className="space-y-2">
        {summary.demo_payments_excluded > 0 && <Notice>{summary.demo_payments_excluded} paiement(s) de démonstration exclus de tous les indicateurs.</Notice>}
        {s.paid_without_commission > 0 && <Notice>{s.paid_without_commission} paiement(s) de la période sans règle de commission approuvée : commission non calculée, règlement en attente.</Notice>}
        {s.due_needs_arbitration > 0 && <Notice>{s.due_needs_arbitration} commande(s) remboursée(s) dont la politique de commission n'est pas décidée : le net dû est à arbitrer.</Notice>}
        <Notice tone="muted"><strong>Reversements : non disponibles.</strong> {summary.payouts.reason} <strong>Bénéfice net : non disponible.</strong> {summary.net_profit.reason} {summary.payment_fees.reason}</Notice>
      </section>

      <details className="rounded-2xl border border-black/[0.06] bg-offwhite px-4 py-3 text-sm">
        <summary className="cursor-pointer select-none font-medium text-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">Définitions des indicateurs</summary>
        <dl className="mt-3 space-y-2">{DEFINITIONS.map(([k, v]) => <div key={k}><dt className="font-medium text-charcoal">{k}</dt><dd className="text-charcoal/65">{v}</dd></div>)}</dl>
        <p className="mt-3 text-xs text-charcoal/50">Période : début inclus, fin exclue, heure de Kinshasa (UTC+1). Une seule devise à la fois : les devises ne sont jamais additionnées.</p>
      </details>

      <section aria-label="Évolution">
        <Card><CardBody className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-base font-semibold text-charcoal">Évolution {granularity === 'day' ? 'par jour' : granularity === 'week' ? 'par semaine' : 'par mois'}</h2>
            <div className="w-full sm:w-64"><Select label="Indicateur" value={metric} onChange={(e) => setMetric(e.target.value as Metric)} options={METRICS.map((m) => ({ value: m.value, label: m.label }))} /></div>
          </div>
          {error ? <ErrorState message={error} /> : series === null ? <LoadingState /> : (
            <FinanceChart title={label} points={series.map((r) => ({ label: r.bucket, value: Number(r[metric]) }))} format={money} summary={`${label} par ${granularity === 'day' ? 'jour' : granularity === 'week' ? 'semaine' : 'mois'} en ${currency}`} />
          )}
        </CardBody></Card>
      </section>

      <section aria-label="Répartition">
        <Card><CardBody className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="text-base font-semibold text-charcoal">Répartition des ventes payées</h2><p className="text-xs text-charcoal/55">Produits payés dans la période (20 premières lignes). La commission n'est pas ventilée par catégorie.</p></div>
            <div className="w-full sm:w-64"><Select label="Par" value={dimension} onChange={(e) => setDimension(e.target.value)} options={DIMENSIONS} /></div>
          </div>
          {rows === null ? <LoadingState /> : rows.length === 0 ? <EmptyState title="Aucune vente payée" description="Aucune commande payée sur cette période." /> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-left text-sm">
              <thead className="border-b border-black/[0.06] text-xs text-charcoal/50"><tr><th scope="col" className="py-2 pr-3 font-medium">{DIMENSIONS.find((d) => d.value === dimension)?.label}</th><th scope="col" className="px-3 py-2 text-right font-medium">Commandes</th><th scope="col" className="px-3 py-2 text-right font-medium">Valeur produits</th><th scope="col" className="py-2 pl-3 text-right font-medium">Commission</th></tr></thead>
              <tbody className="divide-y divide-black/[0.06]">{rows.map((r) => (
                <tr key={r.key}><th scope="row" className="py-2 pr-3 font-medium text-charcoal">{dimension === 'buyer_type' ? BUYER_TYPES[r.key] ?? r.label : r.label}</th><td className="px-3 py-2 text-right tabular-nums">{r.orders_count}</td><td className="px-3 py-2 text-right tabular-nums">{money(r.items_value)}</td><td className="py-2 pl-3 text-right tabular-nums">{r.commission_earned === null ? <Badge variant="neutral">n/d</Badge> : money(r.commission_earned)}</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </CardBody></Card>
      </section>
    </div>
  );
}

function Notice({ children, tone = 'warn' }: { children: React.ReactNode; tone?: 'warn' | 'muted' }) {
  return (
    <p role="status" className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-xs ${tone === 'warn' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-black/[0.06] bg-offwhite text-charcoal/65'}`}>
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>{children}</span>
    </p>
  );
}
