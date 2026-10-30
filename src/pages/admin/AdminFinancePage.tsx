import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button, ErrorState, Input, LoadingState, Select } from '@/components/ui';
import { FinanceJournal } from '@/components/admin/finance/FinanceJournal';
import { FinanceOverview } from '@/components/admin/finance/FinanceOverview';
import { FinanceReconciliation } from '@/components/admin/finance/FinanceReconciliation';
import { FinanceTransactions } from '@/components/admin/finance/FinanceTransactions';
import { useSeo } from '@/hooks/useSeo';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/logger';
import {
  autoGranularity, periodDays, periodFromDates, presetDates, PRESET_LABELS, validatePeriod,
  type FinanceSummary, type Granularity, type PeriodPreset,
} from '@/lib/finance';

type Tab = 'overview' | 'transactions' | 'reconciliation' | 'journal';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Synthèse' }, { id: 'transactions', label: 'Transactions' },
  { id: 'reconciliation', label: 'Rapprochement' }, { id: 'journal', label: 'Journal' },
];
const GRANULARITIES = [{ value: 'auto', label: 'Automatique' }, { value: 'day', label: 'Jour' }, { value: 'week', label: 'Semaine' }, { value: 'month', label: 'Mois' }];

export function AdminFinancePage() {
  useSeo({ title: 'Finance | AgriFlow RDC', noindex: true });
  const [tab, setTab] = useState<Tab>('overview');
  const initial = useMemo(() => presetDates('30d'), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [granularity, setGranularity] = useState<'auto' | Granularity>('auto');
  const [currency, setCurrency] = useState('');
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const [openOrder, setOpenOrder] = useState<string | null>(null);

  const periodError = validatePeriod(from, to);
  const period = useMemo(() => (periodError ? null : periodFromDates(from, to)), [from, to, periodError]);
  const effectiveGranularity: Granularity = granularity === 'auto' ? autoGranularity(periodError ? 30 : periodDays(from, to)) : granularity;

  const load = useCallback(async () => {
    if (!period) return;
    setLoading(true); setFailed(null);
    const { data, error } = await supabase.rpc('admin_finance_summary', { p_from: period.from, p_to: period.to });
    if (error) { reportError('AdminFinancePage.summary', error.message); setFailed('Impossible de charger les indicateurs financiers.'); setLoading(false); return; }
    const s = data as FinanceSummary;
    setSummary(s); setLoading(false);
    setCurrency((c) => (c && (c in s.currencies || Object.keys(s.currencies).length === 0) ? c : Object.keys(s.currencies)[0] ?? 'USD'));
  }, [period]);
  useEffect(() => { void load(); }, [load]);

  const currencies = summary ? Object.keys(summary.currencies) : [];
  const currencyOptions = (currencies.length > 0 ? currencies : [currency || 'USD']).map((c) => ({ value: c, label: c }));
  const applyPreset = (p: PeriodPreset) => { const d = presetDates(p); setFrom(d.from); setTo(d.to); };
  const openFromRecon = useCallback((id: string) => { setTab('transactions'); setOpenOrder(id); }, []);
  const clearOpen = useCallback(() => setOpenOrder(null), []);

  return (
    <DashboardLayout title="Finance">
      <div className="space-y-6">
        <section aria-label="Période" className="space-y-3 rounded-2xl border border-black/[0.06] bg-offwhite p-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Périodes prédéfinies">
            {(Object.keys(PRESET_LABELS) as PeriodPreset[]).map((p) => <Button key={p} size="sm" variant="outline" onClick={() => applyPreset(p)}>{PRESET_LABELS[p]}</Button>)}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input label="Du" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            <Input label="Au (inclus)" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            <Select label="Devise" value={currency} onChange={(e) => setCurrency(e.target.value)} options={currencyOptions} />
            <Select label="Évolution par" value={granularity} onChange={(e) => setGranularity(e.target.value as 'auto' | Granularity)} options={GRANULARITIES} />
          </div>
          {periodError ? <p role="alert" className="text-sm text-rose-700">{periodError}</p> : <p className="text-xs text-charcoal/55">Heure de Kinshasa (UTC+1). Début inclus, fin incluse (jusqu'à minuit). Une seule devise à la fois : les devises ne sont jamais additionnées.</p>}
        </section>

        <div role="tablist" aria-label="Sections financières" className="flex gap-1 overflow-x-auto border-b border-black/[0.06]">
          {TABS.map((t) => (
            <button key={t.id} id={`fin-tab-${t.id}`} role="tab" type="button" aria-selected={tab === t.id} aria-controls={`fin-panel-${t.id}`} onClick={() => setTab(t.id)}
              className={`min-h-[44px] shrink-0 border-b-2 px-4 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${tab === t.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-charcoal/60 hover:text-charcoal'}`}>{t.label}</button>
          ))}
        </div>

        <div role="tabpanel" id={`fin-panel-${tab}`} aria-labelledby={`fin-tab-${tab}`}>
          {!period ? <p className="text-sm text-charcoal/60">Corrigez la période pour afficher les données.</p> : (
            <>
              {tab === 'overview' && (failed ? <ErrorState message={failed} onRetry={() => void load()} /> : loading || !summary ? <LoadingState /> : <FinanceOverview summary={summary} currency={currency || 'USD'} period={period} granularity={effectiveGranularity} />)}
              {tab === 'transactions' && <FinanceTransactions period={period} currency={currency || 'USD'} openOrderId={openOrder} onOpened={clearOpen} />}
              {tab === 'reconciliation' && <FinanceReconciliation period={period} onOpenOrder={openFromRecon} />}
              {tab === 'journal' && <FinanceJournal />}
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
