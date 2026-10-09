import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { Badge, Button, Card, CardBody, EmptyState } from '@/components/ui';
import { Input } from '@/components/ui/Field';
import { toast } from '@/components/ui/toast-store';
import { useLanguage } from '@/contexts/language-context';
import { useNow } from '@/hooks/useNow';
import { fetchConfirmationQueue, fetchConfirmationSettings, QUEUE_PAGE_SIZE, updateConfirmationSettings, type ConfirmationSettings, type QueueOrder } from '@/services/confirmationService';
import { DEADLINE_SOON_MS, formatDeadline, formatRemaining, presenceLabel, REMAINING_REFRESH_MS, type ConfirmationQueueFilter } from '@/lib/order-confirmation';
import { formatDateTime, formatPrice, ORDER_STATUS_LABELS } from '@/lib/constants';
import { paymentSummary } from '@/lib/order-workflow';
import { cn } from '@/lib/utils';

const FILTERS: { id: ConfirmationQueueFilter; key: string }[] = [
  { id: 'pending', key: 'admin.queue.pending' },
  { id: 'soon', key: 'admin.queue.soon' },
  { id: 'expired', key: 'admin.queue.expired' },
  { id: 'confirmed', key: 'admin.queue.confirmed' },
];

/** Vue admin : surveillance des commandes en attente de confirmation (données réelles, paginées, lecture RLS admin). */
export function ConfirmationQueue() {
  const { t, language } = useLanguage();
  const [filter, setFilter] = useState<ConfirmationQueueFilter>('pending');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<QueueOrder[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ConfirmationSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const now = useNow(REMAINING_REFRESH_MS, filter === 'pending' || filter === 'soon');

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchConfirmationQueue(filter, page, DEADLINE_SOON_MS / 3600_000);
    if (result.ok) { setRows(result.data.rows); setHasMore(result.data.hasMore); setError(null); }
    else setError(result.message);
    setLoading(false);
  }, [filter, page]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void fetchConfirmationSettings().then(setSettings); }, []);

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    const result = await updateConfirmationSettings(settings);
    toast(result.ok ? 'success' : 'error', result.ok ? t('admin.queue.settingsSaved') : t(result.message));
    setSaving(false);
  };

  const setNum = (key: keyof ConfirmationSettings, value: string) => setSettings((s) => (s ? { ...s, [key]: Number(value) } : s));

  return (
    <section aria-labelledby="queue-title">
      <h2 id="queue-title" className="mb-1 flex items-center gap-2 text-lg font-semibold text-charcoal"><Clock className="h-5 w-5" aria-hidden="true" /> {t('admin.queue.title')}</h2>
      <p className="mb-4 text-sm text-charcoal/65">{t('admin.queue.intro')}</p>

      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label={t('admin.queue.title')}>
        {FILTERS.map((f) => (
          <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => { setFilter(f.id); setPage(0); }}
            className={cn('inline-flex min-h-[44px] items-center rounded-full border px-4 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500', filter === f.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-black/[0.08] bg-offwhite text-charcoal/75 hover:border-brand-300')}>
            {t(f.key)}
          </button>
        ))}
      </div>

      {error ? (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{error} <button type="button" className="font-semibold underline" onClick={() => void load()}>OK</button></div>
      ) : loading ? (
        <p className="py-6 text-sm text-charcoal/60" aria-busy="true">…</p>
      ) : rows.length === 0 ? (
        <Card><CardBody><EmptyState icon={<Clock className="h-8 w-8" />} title={t('admin.queue.empty')} /></CardBody></Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <caption className="sr-only">{t('admin.queue.title')}</caption>
              <thead className="border-b border-brand-100">
                <tr className="text-left text-xs uppercase tracking-wide text-charcoal/65">
                  {['order', 'producer', 'buyer', 'date', 'deadline', 'remaining', 'payment', 'status'].map((c) => <th key={c} scope="col" className="px-4 py-3 font-medium">{t(`admin.queue.${c}`)}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-50">
                {rows.map((o) => {
                  const remaining = o.confirmation_deadline ? new Date(o.confirmation_deadline).getTime() - now : null;
                  const overdue = o.status === 'pending' && remaining !== null && remaining <= 0;
                  const pay = paymentSummary(o.payment_method, o.payment_status, o.status);
                  const activity = presenceLabel(o.producer_last_seen, t, now);
                  return (
                    <tr key={o.id} className="text-sm">
                      <td className="px-4 py-3"><Link to={`/orders/${o.id}`} className="font-semibold tabular-nums text-brand-700 hover:underline">{o.order_number}</Link><div className="text-xs text-charcoal/60">{formatPrice(o.total_amount, o.currency)}</div></td>
                      <td className="px-4 py-3">{o.producer_name ?? '—'}{activity && <div className="text-xs text-charcoal/60">{activity}</div>}</td>
                      <td className="px-4 py-3">{o.buyer_name ?? '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(o.created_at)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{o.confirmation_deadline ? formatDeadline(o.confirmation_deadline, language) : '—'}</td>
                      <td className={cn('px-4 py-3 whitespace-nowrap font-semibold tabular-nums', overdue && 'text-rose-700')}>
                        {o.status === 'pending' && remaining !== null ? (overdue ? t('confirm.overdue') : formatRemaining(remaining, t)) : '—'}
                      </td>
                      <td className="px-4 py-3"><Badge variant={pay.tone}>{pay.label}</Badge></td>
                      <td className="px-4 py-3"><Badge variant={o.status === 'cancelled' ? 'error' : o.status === 'pending' ? 'warning' : 'success'}>{ORDER_STATUS_LABELS[o.status]}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-brand-100 px-4 py-3 text-sm">
            <span className="text-charcoal/65">{page * QUEUE_PAGE_SIZE + 1}–{page * QUEUE_PAGE_SIZE + rows.length}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>‹</Button>
              <Button size="sm" variant="outline" disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>›</Button>
            </div>
          </div>
        </Card>
      )}

      {settings && (
        <Card className="mt-4">
          <CardBody className="space-y-3">
            <h3 className="text-sm font-bold text-charcoal">{t('admin.queue.settings')}</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input label={t('admin.queue.timeout')} type="number" min={1} max={168} step={0.5} value={settings.timeout_hours} onChange={(e) => setNum('timeout_hours', e.target.value)} />
              <Input label={t('admin.queue.reminder')} type="number" min={0.5} step={0.5} value={settings.reminder_after_hours} onChange={(e) => setNum('reminder_after_hours', e.target.value)} />
              <Input label={t('admin.queue.lastReminder')} type="number" min={0.5} step={0.5} value={settings.last_reminder_before_hours} onChange={(e) => setNum('last_reminder_before_hours', e.target.value)} />
            </div>
            <Button size="sm" loading={saving} onClick={() => void saveSettings()}>{t('admin.queue.saveSettings')}</Button>
          </CardBody>
        </Card>
      )}
    </section>
  );
}
