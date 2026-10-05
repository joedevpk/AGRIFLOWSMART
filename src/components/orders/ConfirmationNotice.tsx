import type { ReactNode } from 'react';
import { AlertTriangle, Clock, Info, XCircle } from 'lucide-react';
import { useLanguage } from '@/contexts/language-context';
import { useNow } from '@/hooks/useNow';
import { useProducerPresence } from '@/hooks/useProducerPresence';
import { confirmationState, formatDeadline, formatRemaining, presenceLabel, REMAINING_REFRESH_MS } from '@/lib/order-confirmation';
import { cn } from '@/lib/utils';
import type { OrderWithDetails } from '@/types';
import { OrderAlternatives } from './OrderAlternatives';

type Tone = 'info' | 'warning' | 'error' | 'neutral';

const TONE_CLASSES: Record<Tone, string> = {
  info: 'border-blue-200 bg-blue-50 text-blue-950 dark:border-blue-700/50 dark:bg-blue-900/20 dark:text-blue-50',
  warning: 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-600/50 dark:bg-amber-900/20 dark:text-amber-50',
  error: 'border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-700/50 dark:bg-rose-900/20 dark:text-rose-50',
  neutral: 'border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50',
};

function Banner({ tone, icon, title, children }: { tone: Tone; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div role="status" className={cn('rounded-2xl border p-4 sm:p-5', TONE_CLASSES[tone])}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0" aria-hidden="true">{icon}</span>
        <div className="min-w-0 space-y-1.5 text-sm">
          <p className="text-base font-bold">{title}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Explique à chaque état : que se passe-t-il, pourquoi, que faire.
 * Le temps restant est calculé depuis `orders.confirmation_deadline` (jamais un faux compte à rebours) ;
 * la dernière activité du producteur n'apparaît que si `last_seen_at` existe.
 */
export function ConfirmationNotice({ order, viewer }: { order: OrderWithDetails; viewer: 'buyer' | 'producer' | 'admin' }) {
  const { t, language } = useLanguage();
  const state = confirmationState(order);
  const waiting = state.kind === 'awaiting_producer';
  const now = useNow(REMAINING_REFRESH_MS, waiting);
  const presence = useProducerPresence(viewer === 'buyer' && waiting ? order.producer_id : null);

  if (state.kind === 'none') return null;
  const refund = order.refunds?.[0] ?? null;

  if (state.kind === 'awaiting_payment') {
    if (viewer !== 'buyer') return null;
    return (
      <Banner tone="info" icon={<Info className="h-5 w-5" />} title={t('confirm.paymentWaitTitle')}>
        <p>{t('confirm.paymentWaitBody')}</p>
      </Banner>
    );
  }

  if (state.kind === 'awaiting_producer' && state.deadline) {
    const remainingMs = new Date(state.deadline).getTime() - now;
    const date = formatDeadline(state.deadline, language);
    const overdue = remainingMs <= 0;
    const activity = presenceLabel(presence?.last_seen_at ?? null, t, now);
    const tone: Tone = overdue ? 'error' : remainingMs <= 4 * 3600_000 ? 'warning' : 'warning';
    return (
      <Banner tone={tone} icon={overdue ? <AlertTriangle className="h-5 w-5" /> : <Clock className="h-5 w-5" />} title={viewer === 'producer' ? t('confirm.producerTitle') : t('confirm.pendingTitle')}>
        {viewer === 'producer' ? (
          <p>{t('confirm.producerBody', { date })}</p>
        ) : (
          <>
            <p>{t('confirm.pendingBody')}</p>
            <p>{t('confirm.why')}</p>
            <p className="font-semibold">{t('confirm.expectedBefore', { date })}</p>
            {presence && !presence.accepting && <p className="font-medium">{t('producer.unavailableNote')}</p>}
            {activity && <p>{t('confirm.lastActivity', { when: activity })}</p>}
            {!overdue && <p>{t('confirm.expiresWarning', { date })}</p>}
          </>
        )}
        <p className="font-semibold tabular-nums">{overdue ? t('confirm.overdue') : t('confirm.remaining', { time: formatRemaining(remainingMs, t) })}</p>
      </Banner>
    );
  }

  // expired | rejected — information principalement destinée à l'acheteur
  const expired = state.kind === 'expired';
  const paid = order.payment_status === 'paid' || order.payment_status === 'refunded';
  const refundNote = refund?.status === 'completed' || order.payment_status === 'refunded'
    ? t('refund.noteDone')
    : refund?.status === 'processing' ? t('refund.noteInProgress')
    : refund?.status === 'failed' ? t('refund.failed')
    : t('refund.noteToProcess');

  return (
    <div className="space-y-4">
      <Banner tone={expired ? 'warning' : 'error'} icon={expired ? <AlertTriangle className="h-5 w-5" /> : <XCircle className="h-5 w-5" />} title={expired ? t('expired.title') : t('expired.rejectedTitle')}>
        <p>{expired ? t('expired.body') : t('expired.rejectedBody')}</p>
        <p>{paid ? refundNote : t('expired.noPayment')}</p>
      </Banner>
      {viewer === 'buyer' && <OrderAlternatives orderId={order.id} />}
    </div>
  );
}
