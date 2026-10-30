import { useCallback, useEffect, useMemo, useState } from 'react';
import { Percent, ShieldAlert, ShieldCheck, History, Receipt } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Badge, Button, Card, CardBody, EmptyState, ErrorState, Input, LoadingState, Select, Textarea } from '@/components/ui';
import { toast } from '@/components/ui/toast-store';
import { useConfirmAction } from '@/hooks/useConfirmAction';
import { useSeo } from '@/hooks/useSeo';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/logger';
import { formatDate, formatPrice } from '@/lib/constants';
import {
  bpsToPercentLabel, COMMISSION_STATUS_LABELS, explainCommission, percentToBps,
  type CommissionStatus, type RefundCommissionPolicy,
} from '@/lib/commission';

interface Rule {
  id: string; rate_bps: number; status: 'draft' | 'approved' | 'retired'; effective_from: string | null;
  refund_commission_policy: RefundCommissionPolicy; validation_reference: string | null; note: string | null;
  created_at: string; created_by: string | null; approved_at: string | null; approved_by: string | null;
  retired_at: string | null; retire_reason: string | null;
}
interface Overview { configured: boolean; active_rule: Rule | null; drafts: number; orders_computed: number; orders_not_configured: number; orders_legacy: number }
interface AuditRow { id: string; occurred_at: string; actor_id: string | null; action: string; entity_id: string | null; after_state: Record<string, unknown> | null }
interface Tx {
  order_id: string; order_number: string | null; created_at: string; payment_status: string; settlement_status: string; currency: string;
  items_subtotal: number; delivery_fee: number; buyer_total: number; refunded_amount: number; payment_reference: string | null;
  commission_status: CommissionStatus | null; commission_rate_bps: number | null; commission_base: number | null; commission_rule_id: string | null;
  platform_commission: number | null; commission_reversed: number | null; producer_net: number | null; producer_net_after_refund: number | null;
}
interface LedgerRow { id: string; occurred_at: string; event_type: string; amount: number | null; currency: string | null }

const TX_COLUMNS = 'order_id, order_number, created_at, payment_status, settlement_status, currency, items_subtotal, delivery_fee, buyer_total, refunded_amount, payment_reference, commission_status, commission_rate_bps, commission_base, commission_rule_id, platform_commission, commission_reversed, producer_net, producer_net_after_refund';
const RULE_COLUMNS = 'id, rate_bps, status, effective_from, refund_commission_policy, validation_reference, note, created_at, created_by, approved_at, approved_by, retired_at, retire_reason';
const POLICY_OPTIONS = [
  { value: '', label: 'Non décidée (à arbitrer au cas par cas)' },
  { value: 'proportional', label: 'Commission annulée au prorata du remboursement' },
  { value: 'keep_all', label: 'Commission conservée en cas de remboursement' },
];
const POLICY_LABEL: Record<string, string> = { proportional: 'Au prorata', keep_all: 'Conservée' };
const RULE_STATUS: Record<Rule['status'], { label: string; variant: 'neutral' | 'success' | 'default' }> = {
  draft: { label: 'Brouillon', variant: 'neutral' }, approved: { label: 'Approuvée', variant: 'success' }, retired: { label: 'Retirée', variant: 'default' },
};
const AUDIT_LABEL: Record<string, string> = { 'commission_rule.created': 'Brouillon créé', 'commission_rule.approved': 'Règle approuvée', 'commission_rule.retired': 'Règle retirée' };
const PAGE = 25;
const rpcMessage = (m: string) => (m.length > 160 ? 'Opération refusée.' : m);

export function AdminCommissionsPage() {
  useSeo({ title: 'Commissions | AgriFlow RDC', noindex: true });
  const { request, dialog } = useConfirmAction();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);

  // création d'un brouillon
  const [ratePct, setRatePct] = useState('');
  const [policy, setPolicy] = useState('');
  const [note, setNote] = useState('');
  const [rateError, setRateError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  // approbation / retrait
  const [approving, setApproving] = useState<string | null>(null);
  const [validationRef, setValidationRef] = useState('');
  const [effective, setEffective] = useState('');
  const [retiring, setRetiring] = useState<string | null>(null);
  const [retireReason, setRetireReason] = useState('');
  // transactions
  const [txs, setTxs] = useState<Tx[]>([]);
  const [txMore, setTxMore] = useState(false);
  const [txPage, setTxPage] = useState(1);
  const [txLoading, setTxLoading] = useState(false);
  const [fStatus, setFStatus] = useState('all');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [fRef, setFRef] = useState('');
  const [selected, setSelected] = useState<Tx | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);

  const loadAll = useCallback(async () => {
    setFailed(null);
    const [ov, rl, au] = await Promise.all([
      supabase.rpc('admin_commission_overview'),
      supabase.from('commission_rules').select(RULE_COLUMNS).order('created_at', { ascending: false }).limit(50),
      supabase.from('financial_audit_log').select('id, occurred_at, actor_id, action, entity_id, after_state').order('occurred_at', { ascending: false }).limit(30),
    ]);
    const err = ov.error ?? rl.error ?? au.error;
    if (err) { reportError('AdminCommissionsPage.loadAll', err.message); setFailed('Impossible de charger la configuration des commissions.'); setLoading(false); return; }
    setOverview(ov.data as Overview); setRules((rl.data ?? []) as Rule[]); setAudit((au.data ?? []) as AuditRow[]);
    const ids = Array.from(new Set([...(rl.data ?? []).flatMap((r) => [r.created_by, r.approved_by]), ...(au.data ?? []).map((a) => a.actor_id)].filter((x): x is string => !!x)));
    if (ids.length > 0) {
      const { data } = await supabase.from('profiles').select('user_id, full_name').in('user_id', ids);
      setNames(Object.fromEntries((data ?? []).map((p) => [p.user_id as string, p.full_name as string])));
    }
    setLoading(false);
  }, []);

  const loadTxs = useCallback(async (page: number, replace: boolean) => {
    setTxLoading(true);
    let q = supabase.from('order_financials').select(TX_COLUMNS).order('created_at', { ascending: false }).order('order_id');
    if (fStatus !== 'all') q = q.eq('payment_status', fStatus);
    if (fFrom) q = q.gte('created_at', `${fFrom}T00:00:00`);
    if (fTo) q = q.lte('created_at', `${fTo}T23:59:59`);
    const ref = fRef.trim().replace(/[%,()]/g, '');
    if (ref) q = q.or(`order_number.ilike.%${ref}%,payment_reference.ilike.%${ref}%`);
    const from = (page - 1) * PAGE;
    const { data, error } = await q.range(from, from + PAGE);
    if (error) { reportError('AdminCommissionsPage.loadTxs', error.message); toast('error', 'Impossible de charger les transactions.'); setTxLoading(false); return; }
    const rows = (data ?? []) as Tx[];
    setTxMore(rows.length > PAGE); setTxPage(page);
    setTxs((prev) => (replace ? rows.slice(0, PAGE) : [...prev, ...rows.slice(0, PAGE)]));
    setTxLoading(false);
  }, [fStatus, fFrom, fTo, fRef]);

  useEffect(() => { void loadAll(); }, [loadAll]);
  useEffect(() => { void loadTxs(1, true); }, [loadTxs]);
  useEffect(() => {
    if (!selected) { setLedger([]); return; }
    void supabase.from('financial_events').select('id, occurred_at, event_type, amount, currency').eq('order_id', selected.order_id).order('occurred_at').then(({ data }) => setLedger((data ?? []) as LedgerRow[]));
  }, [selected]);

  const createDraft = async () => {
    let bps: number;
    try { bps = percentToBps(ratePct); setRateError(undefined); } catch (e) { setRateError((e as Error).message); return; }
    setSaving(true);
    const { error } = await supabase.rpc('admin_create_commission_rule', { p_rate_bps: bps, p_refund_policy: policy || null, p_note: note.trim() || null });
    setSaving(false);
    if (error) { reportError('AdminCommissionsPage.create', error.message); toast('error', rpcMessage(error.message)); return; }
    toast('success', 'Brouillon créé. Il ne s\'applique à aucune commande tant qu\'il n\'est pas approuvé.');
    setRatePct(''); setNote(''); setPolicy(''); await loadAll();
  };

  const approve = (rule: Rule) => request({
    title: `Approuver le taux de ${bpsToPercentLabel(rule.rate_bps)} ?`,
    description: 'Ce taux s\'appliquera aux NOUVELLES commandes à partir de la date d\'effet. Les commandes existantes ne changent jamais. Action tracée dans le journal d\'audit.',
    confirmLabel: 'Approuver',
    run: async () => {
      const { error } = await supabase.rpc('admin_approve_commission_rule', { p_rule_id: rule.id, p_validation_reference: validationRef.trim(), p_effective_from: effective ? new Date(effective).toISOString() : null });
      if (error) { reportError('AdminCommissionsPage.approve', error.message); toast('error', rpcMessage(error.message)); return; }
      toast('success', 'Règle approuvée.'); setApproving(null); setValidationRef(''); setEffective(''); await loadAll();
    },
  });

  const retire = (rule: Rule) => request({
    title: 'Retirer cette règle ?', destructive: true, confirmLabel: 'Retirer',
    description: 'Si aucune autre règle approuvée n\'est effective, les nouvelles commandes n\'auront plus de commission (état « non configuré »). Les commandes existantes ne changent pas.',
    run: async () => {
      const { error } = await supabase.rpc('admin_retire_commission_rule', { p_rule_id: rule.id, p_reason: retireReason.trim() });
      if (error) { reportError('AdminCommissionsPage.retire', error.message); toast('error', rpcMessage(error.message)); return; }
      toast('success', 'Règle retirée.'); setRetiring(null); setRetireReason(''); await loadAll();
    },
  });

  const who = (id: string | null) => (id ? names[id] ?? `${id.slice(0, 8)}…` : '—');
  const active = overview?.active_rule ?? null;
  const explanation = useMemo(() => selected && selected.commission_status ? explainCommission({
    status: selected.commission_status, rateBps: selected.commission_rate_bps, base: selected.commission_base,
    commission: selected.platform_commission, currency: selected.currency, ruleId: selected.commission_rule_id,
  }) : null, [selected]);

  return (
    <DashboardLayout title="Commissions">
      {dialog}
      {loading ? <LoadingState /> : failed ? <ErrorState message={failed} onRetry={() => { setLoading(true); void loadAll(); }} /> : (
        <div className="space-y-8">
          <Card><CardBody className="space-y-3">
            <div className="flex items-start gap-3">
              {overview?.configured ? <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" /> : <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />}
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-charcoal">{overview?.configured && active ? `Règle active : ${bpsToPercentLabel(active.rate_bps)} sur le montant des produits` : 'Aucune commission configurée'}</h2>
                <p className="mt-1 text-sm text-charcoal/60">
                  {overview?.configured && active
                    ? `Effective depuis le ${formatDate(active.effective_from ?? active.created_at)} · validation : ${active.validation_reference ?? '—'} · approuvée par ${who(active.approved_by)}.`
                    : 'Tant qu\'un taux n\'est pas approuvé, les commandes sont enregistrées sans commission et le net producteur n\'est pas calculé (règlement en attente). Les paiements des acheteurs ne sont pas bloqués.'}
                </p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {([['Calculées', overview?.orders_computed], ['Non configurées', overview?.orders_not_configured], ['Ancienne méthode', overview?.orders_legacy], ['Brouillons', overview?.drafts]] as const).map(([k, v]) => (
                <div key={k} className="rounded-xl border border-black/[0.06] bg-offwhite px-3 py-2"><dt className="text-xs text-charcoal/50">{k}</dt><dd className="text-lg font-semibold tabular-nums text-charcoal">{v ?? 0}</dd></div>
              ))}
            </dl>
          </CardBody></Card>

          <section aria-labelledby="new-rule">
            <h2 id="new-rule" className="mb-3 flex items-center gap-2 text-base font-semibold text-charcoal"><Percent className="h-4 w-4" aria-hidden="true" />Nouvelle règle (brouillon)</h2>
            <Card><CardBody className="space-y-4">
              <p className="text-sm text-charcoal/60">Le taux doit avoir été validé commercialement avant approbation. Le brouillon n'affecte aucune commande. Aucun taux n'est proposé par défaut.</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input label="Taux de commission (%)" inputMode="decimal" placeholder="ex. 7,5" value={ratePct} onChange={(e) => setRatePct(e.target.value)} error={rateError} hint="Sur le montant des produits, hors livraison. 2 décimales maximum." />
                <Select label="Remboursement et commission" options={POLICY_OPTIONS} value={policy} onChange={(e) => setPolicy(e.target.value)} />
              </div>
              <Textarea label="Note interne (facultatif)" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
              <Button onClick={() => void createDraft()} loading={saving} disabled={ratePct.trim() === ''}>Créer le brouillon</Button>
            </CardBody></Card>
          </section>

          <section aria-labelledby="rules">
            <h2 id="rules" className="mb-3 flex items-center gap-2 text-base font-semibold text-charcoal"><History className="h-4 w-4" aria-hidden="true" />Règles et historique</h2>
            {rules.length === 0 ? <Card><CardBody><EmptyState icon={<Percent className="h-8 w-8" />} title="Aucune règle enregistrée" description="Créez un brouillon, faites-le valider commercialement, puis approuvez-le." /></CardBody></Card> : (
              <div className="space-y-3">
                {rules.map((r) => (
                  <Card key={r.id}><CardBody className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2"><span className="text-lg font-semibold tabular-nums text-charcoal">{bpsToPercentLabel(r.rate_bps)}</span><Badge variant={RULE_STATUS[r.status].variant}>{RULE_STATUS[r.status].label}</Badge></div>
                      <div className="flex gap-2">
                        {r.status === 'draft' && <Button size="sm" onClick={() => { setApproving(approving === r.id ? null : r.id); setRetiring(null); }}>Approuver…</Button>}
                        {r.status !== 'retired' && <Button size="sm" variant="outline" onClick={() => { setRetiring(retiring === r.id ? null : r.id); setApproving(null); }}>Retirer…</Button>}
                      </div>
                    </div>
                    <p className="text-xs text-charcoal/55">Créée le {formatDate(r.created_at)} par {who(r.created_by)}
                      {r.approved_at ? ` · approuvée le ${formatDate(r.approved_at)} par ${who(r.approved_by)} (effet : ${formatDate(r.effective_from ?? r.approved_at)}, réf. ${r.validation_reference})` : ''}
                      {r.retired_at ? ` · retirée le ${formatDate(r.retired_at)} : ${r.retire_reason}` : ''}
                      {` · remboursement : ${r.refund_commission_policy ? POLICY_LABEL[r.refund_commission_policy] : 'non décidé'}`}{r.note ? ` · ${r.note}` : ''}</p>
                    {approving === r.id && (
                      <div className="grid grid-cols-1 gap-3 rounded-xl border border-black/[0.06] bg-offwhite p-3 sm:grid-cols-2">
                        <Input label="Référence de validation commerciale" value={validationRef} maxLength={200} onChange={(e) => setValidationRef(e.target.value)} hint="Obligatoire (décision, PV, courriel…)." />
                        <Input label="Date d'effet (facultatif)" type="datetime-local" value={effective} onChange={(e) => setEffective(e.target.value)} hint="Vide = maintenant. Pas d'antidatage." />
                        <div className="sm:col-span-2"><Button onClick={() => approve(r)} disabled={validationRef.trim().length < 3}>Continuer</Button></div>
                      </div>
                    )}
                    {retiring === r.id && (
                      <div className="grid grid-cols-1 gap-3 rounded-xl border border-black/[0.06] bg-offwhite p-3">
                        <Input label="Motif du retrait" value={retireReason} maxLength={300} onChange={(e) => setRetireReason(e.target.value)} />
                        <div><Button variant="danger" onClick={() => retire(r)} disabled={retireReason.trim().length < 3}>Continuer</Button></div>
                      </div>
                    )}
                  </CardBody></Card>
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="txs">
            <h2 id="txs" className="mb-3 flex items-center gap-2 text-base font-semibold text-charcoal"><Receipt className="h-4 w-4" aria-hidden="true" />Transactions</h2>
            <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Select label="Paiement" value={fStatus} onChange={(e) => setFStatus(e.target.value)} options={[{ value: 'all', label: 'Tous' }, { value: 'paid', label: 'Payé' }, { value: 'pending', label: 'En attente' }, { value: 'processing', label: 'En cours' }, { value: 'failed', label: 'Échoué' }, { value: 'cancelled', label: 'Annulé' }, { value: 'expired', label: 'Expiré' }, { value: 'refunded', label: 'Remboursé' }]} />
              <Input label="Du" type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
              <Input label="Au" type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} />
              <Input label="Référence" placeholder="N° de commande ou de paiement" value={fRef} onChange={(e) => setFRef(e.target.value)} />
            </div>
            {txs.length === 0 && !txLoading ? <Card><CardBody><EmptyState icon={<Receipt className="h-8 w-8" />} title="Aucune transaction" description="Aucune commande ne correspond à ces filtres." /></CardBody></Card> : (
              <Card><CardBody className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-black/[0.06] text-xs text-charcoal/50"><tr><th className="px-4 py-3 font-medium">Commande</th><th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Paiement</th><th className="px-4 py-3 text-right font-medium">Produits</th><th className="px-4 py-3 text-right font-medium">Livraison</th><th className="px-4 py-3 text-right font-medium">Commission</th><th className="px-4 py-3 text-right font-medium">Net producteur</th></tr></thead>
                <tbody className="divide-y divide-black/[0.06]">
                  {txs.map((t) => (
                    <tr key={t.order_id} className={selected?.order_id === t.order_id ? 'bg-brand-50/60' : undefined}>
                      <td className="px-4 py-3"><button type="button" onClick={() => setSelected(t)} className="font-medium tabular-nums text-brand-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">{t.order_number ?? t.order_id.slice(0, 8)}</button></td>
                      <td className="px-4 py-3 text-charcoal/60">{formatDate(t.created_at)}</td>
                      <td className="px-4 py-3">{t.payment_status}{t.refunded_amount > 0 ? ` · remb. ${formatPrice(t.refunded_amount, t.currency)}` : ''}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatPrice(t.items_subtotal, t.currency)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatPrice(t.delivery_fee, t.currency)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{t.commission_status === 'not_configured' ? <Badge variant="warning">Non configurée</Badge> : t.platform_commission === null ? '—' : formatPrice(t.platform_commission, t.currency)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{t.producer_net === null ? '—' : formatPrice(t.producer_net, t.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div></CardBody></Card>
            )}
            {txMore && <div className="mt-3 flex justify-center"><Button variant="outline" loading={txLoading} onClick={() => void loadTxs(txPage + 1, false)}>Charger plus</Button></div>}

            {selected && (
              <Card className="mt-4"><CardBody className="space-y-3">
                <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-charcoal">Détail du calcul — {selected.order_number ?? selected.order_id.slice(0, 8)}</h3><Button size="sm" variant="ghost" onClick={() => setSelected(null)}>Fermer</Button></div>
                <p className="text-sm text-charcoal/70">{explanation ?? 'Aucune donnée de commission.'}</p>
                <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                  {([
                    ['Produits', formatPrice(selected.items_subtotal, selected.currency)],
                    ['Livraison (hors commission)', formatPrice(selected.delivery_fee, selected.currency)],
                    ['Total acheteur', formatPrice(selected.buyer_total, selected.currency)],
                    ['Commission', selected.platform_commission === null ? 'Non applicable' : formatPrice(selected.platform_commission, selected.currency)],
                    ['Statut commission', selected.commission_status ? COMMISSION_STATUS_LABELS[selected.commission_status] : '—'],
                    ['Frais de paiement', 'Non suivis'],
                    ['Remboursé', formatPrice(selected.refunded_amount, selected.currency)],
                    ['Commission annulée', selected.commission_reversed === null ? 'À arbitrer' : formatPrice(selected.commission_reversed, selected.currency)],
                    ['Net après remboursement', selected.producer_net_after_refund === null ? '—' : formatPrice(selected.producer_net_after_refund, selected.currency)],
                  ] as const).map(([k, v]) => <div key={k} className="rounded-xl border border-black/[0.06] bg-offwhite px-3 py-2"><dt className="text-xs text-charcoal/50">{k}</dt><dd className="font-medium tabular-nums text-charcoal">{v}</dd></div>)}
                </dl>
                {ledger.length > 0 && (
                  <div><h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-charcoal/50">Événements financiers</h4>
                    <ul className="divide-y divide-black/[0.06] rounded-xl border border-black/[0.06] text-sm">{ledger.map((e) => <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2"><span>{e.event_type}</span><span className="text-xs text-charcoal/55">{formatDate(e.occurred_at)}{e.amount !== null ? ` · ${formatPrice(e.amount, e.currency ?? selected.currency)}` : ''}</span></li>)}</ul></div>
                )}
              </CardBody></Card>
            )}
          </section>

          <section aria-labelledby="audit">
            <h2 id="audit" className="mb-3 text-base font-semibold text-charcoal">Journal d'audit</h2>
            {audit.length === 0 ? <Card><CardBody><EmptyState icon={<History className="h-8 w-8" />} title="Aucune modification enregistrée" /></CardBody></Card> : (
              <Card><CardBody className="p-0"><ul className="divide-y divide-black/[0.06]">
                {audit.map((a) => <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"><span className="font-medium text-charcoal">{AUDIT_LABEL[a.action] ?? a.action}{typeof a.after_state?.rate_bps === 'number' ? ` · ${bpsToPercentLabel(a.after_state.rate_bps)}` : ''}</span><span className="text-xs text-charcoal/55">{formatDate(a.occurred_at)} · {who(a.actor_id)}</span></li>)}
              </ul></CardBody></Card>
            )}
          </section>
        </div>
      )}
    </DashboardLayout>
  );
}
