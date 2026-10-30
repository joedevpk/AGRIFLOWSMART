import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Info, ShieldCheck } from 'lucide-react';
import { Badge, Button, Card, CardBody, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { formatDateTime, formatPrice } from '@/lib/constants';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/logger';
import { RECON_LABELS, type ReconReport } from '@/lib/finance';

const SEV = { error: { label: 'Divergence', variant: 'error' }, warning: { label: 'À vérifier', variant: 'warning' }, info: { label: 'Information', variant: 'neutral' } } as const;

export function FinanceReconciliation({ period, onOpenOrder }: { period: { from: string; to: string }; onOpenOrder: (orderId: string) => void }) {
  const [report, setReport] = useState<ReconReport | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const run = useCallback(async () => {
    setLoading(true); setFailed(null);
    const { data, error } = await supabase.rpc('admin_reconciliation_report', { p_from: period.from, p_to: period.to });
    if (error) { reportError('FinanceReconciliation.run', error.message); setFailed('Impossible de lancer le rapprochement.'); setLoading(false); return; }
    setReport(data as ReconReport); setLoading(false);
  }, [period.from, period.to]);
  useEffect(() => { void run(); }, [run]);

  if (loading) return <LoadingState />;
  if (failed || !report) return <ErrorState message={failed ?? 'Rapport indisponible.'} onRetry={() => void run()} />;
  return (
    <div className="space-y-4">
      <p role="note" className="flex items-start gap-2 rounded-xl border border-black/[0.06] bg-offwhite px-4 py-3 text-xs text-charcoal/70">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Rapprochement entre commandes, paiements confirmés, remboursements et commissions. <strong>Lecture seule : aucune donnée n'est corrigée automatiquement.</strong> Toute correction doit passer par une procédure auditée. Généré le {formatDateTime(report.generated_at)}.</span>
      </p>
      <p role="note" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span><strong>Reversements aux producteurs : non disponibles.</strong> {report.payouts.reason}</span></p>
      <div className="grid grid-cols-3 gap-3 text-sm">
        {([['Divergences', report.errors], ['À vérifier', report.warnings], ['Informations', report.infos]] as const).map(([k, n]) => <div key={k} className="rounded-xl border border-black/[0.06] bg-offwhite px-3 py-2"><p className="text-xs text-charcoal/50">{k}</p><p className="text-xl font-bold tabular-nums text-charcoal">{n}</p></div>)}
      </div>
      {report.items.length === 0 ? (
        <Card><CardBody><EmptyState icon={<CheckCircle2 className="h-8 w-8" />} title="Aucune divergence détectée" description="Sur cette période, commandes, paiements, remboursements et commissions sont cohérents." /></CardBody></Card>
      ) : (
        <Card><CardBody className="p-0"><ul className="divide-y divide-black/[0.06]">{report.items.map((it, i) => (
          <li key={`${it.kind}-${it.order_id}-${i}`} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2"><Badge variant={SEV[it.severity].variant}>{SEV[it.severity].label}</Badge><span className="font-medium text-charcoal">{RECON_LABELS[it.kind] ?? it.kind}</span></div>
              <p className="text-xs text-charcoal/60">{it.detail}</p>
              {(it.expected !== null || it.actual !== null) && <p className="text-xs tabular-nums text-charcoal/70">Attendu : {it.expected === null ? '—' : formatPrice(it.expected, it.currency ?? 'USD')} · Constaté : {it.actual === null ? '—' : formatPrice(it.actual, it.currency ?? 'USD')}</p>}
            </div>
            {it.order_id && <Button size="sm" variant="outline" onClick={() => onOpenOrder(it.order_id as string)}>Voir la transaction</Button>}
          </li>))}</ul></CardBody></Card>
      )}
      {report.truncated && <p className="text-xs text-charcoal/55">Seules les 500 premières lignes sont affichées ; réduisez la période pour tout examiner.</p>}
    </div>
  );
}
