import type { ReactNode } from 'react';
import { Check, Clock, Circle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Order, OrderStatus } from '@/types';
import { ORDER_WORKFLOW, formatDateTime } from '@/lib/constants';
import { useLanguage } from '@/contexts/language-context';

type StepState = 'done' | 'current' | 'todo';
interface Step { key: string; label: string; state: StepState; time?: string; hint?: string }

interface OrderTimelineProps {
  currentStatus: OrderStatus;
  history: { status: OrderStatus; created_at: string; note: string | null }[];
  /** Champs de commande permettant d'afficher le paiement et la confirmation du producteur (Passe 23). */
  order?: Pick<Order, 'payment_method' | 'payment_status' | 'confirmation_deadline' | 'cancel_reason' | 'created_at'>;
  className?: string;
}

/**
 * Chronologie de la commande. S'appuie UNIQUEMENT sur la machine à états existante (`orders.status`) :
 * l'étape « Confirmation du producteur » correspond au passage `pending → confirmed`, « Paiement confirmé »
 * ne s'affiche coché que si `payment_status` est réellement `paid`.
 */
export function OrderTimeline({ currentStatus, history, order, className }: OrderTimelineProps) {
  const { t } = useLanguage();
  const times = new Map<string, string>();
  history.forEach((h) => { if (!times.has(h.status)) times.set(h.status, h.created_at); });

  const cancelled = currentStatus === 'cancelled';
  // Dernier statut du flux normal réellement atteint (utile pour une commande annulée en cours de route).
  const reachedIndex = cancelled
    ? Math.max(0, ...history.map((h) => ORDER_WORKFLOW.indexOf(h.status)))
    : ORDER_WORKFLOW.indexOf(currentStatus);

  const online = order?.payment_method === 'mobile_money' || order?.payment_method === 'card';
  const paid = order?.payment_status === 'paid' || order?.payment_status === 'refunded';
  const showPayment = !!order && (online || paid);

  const steps: Step[] = [];
  steps.push({ key: 'created', label: t('timeline.created'), state: 'done', time: times.get('pending') ?? order?.created_at });

  if (showPayment) {
    steps.push({ key: 'payment', label: paid ? t('timeline.paymentConfirmed') : t('timeline.paymentPending'), state: paid ? 'done' : (cancelled ? 'todo' : 'current'), hint: paid ? undefined : t('timeline.waiting') });
  }

  const confirmed = reachedIndex >= 1;
  const waitingConfirmation = !cancelled && currentStatus === 'pending' && (!showPayment || paid);
  steps.push({
    key: 'confirmation', label: t('timeline.producerConfirmation'),
    state: confirmed ? 'done' : waitingConfirmation ? 'current' : 'todo',
    time: times.get('confirmed'), hint: waitingConfirmation ? t('timeline.waiting') : undefined,
  });

  const flow: { status: OrderStatus; label: string }[] = [
    { status: 'preparing', label: t('timeline.preparing') },
    { status: 'ready', label: t('timeline.ready') },
    { status: 'in_delivery', label: t('timeline.delivery') },
    { status: 'delivered', label: t('timeline.delivered') },
    { status: 'completed', label: t('timeline.completed') },
  ];
  flow.forEach(({ status, label }) => {
    const idx = ORDER_WORKFLOW.indexOf(status);
    const done = reachedIndex > idx || (!cancelled && currentStatus === status && status === 'completed') || (cancelled && reachedIndex >= idx);
    const current = !cancelled && currentStatus === status && !done;
    steps.push({ key: status, label, state: done ? 'done' : current ? 'current' : 'todo', time: times.get(status), hint: current ? t('timeline.inProgress') : undefined });
  });

  const endNote = cancelled
    ? (order?.cancel_reason === 'confirmation_expired' ? t('timeline.expired')
      : order?.cancel_reason === 'producer_rejected' ? t('timeline.rejected')
      : t('timeline.cancelled'))
    : null;

  return (
    <ol className={cn('space-y-0', className)} aria-label={t('timeline.label')}>
      {steps.map((step, idx) => {
        const last = idx === steps.length - 1 && !endNote;
        return (
          <li key={step.key} className="relative flex gap-4 pb-7 last:pb-0" aria-current={step.state === 'current' ? 'step' : undefined}>
            {!last && <div aria-hidden="true" className={cn('absolute left-[15px] top-8 bottom-0 w-0.5', step.state === 'done' ? 'bg-brand-500' : 'bg-brand-100')} />}
            <div className={cn(
              'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
              step.state === 'done' && 'bg-brand-500 text-white',
              step.state === 'current' && 'bg-accent-500 text-white ring-4 ring-accent-100',
              step.state === 'todo' && 'bg-cream text-charcoal/50',
            )}>
              {step.state === 'done' ? <Check className="h-4 w-4" aria-hidden="true" /> : step.state === 'current' ? <Clock className="h-4 w-4" aria-hidden="true" /> : <Circle className="h-3.5 w-3.5" aria-hidden="true" />}
            </div>
            <div className="pt-1">
              <p className={cn('text-sm font-medium', step.state === 'todo' ? 'text-charcoal/55' : 'text-charcoal')}>
                {step.label}
                {step.hint && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">{step.hint}</span>}
              </p>
              {step.time && step.state === 'done' && <p className="mt-0.5 text-xs text-charcoal/60">{formatDateTime(step.time)}</p>}
            </div>
          </li>
        );
      })}
      {endNote && (
        <li className="relative flex gap-4 pt-7">
          <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700"><XCircle className="h-4 w-4" aria-hidden="true" /></div>
          <div className="pt-1">
            <p className="text-sm font-semibold text-rose-800">{endNote}</p>
            {times.get('cancelled') && <p className="mt-0.5 text-xs text-charcoal/60">{formatDateTime(times.get('cancelled')!)}</p>}
          </div>
        </li>
      )}
    </ol>
  );
}

interface MatchCardProps {
  score: number;
  reasons: { label: string; matched: boolean }[];
  producerName: string;
  location: string;
  quantity: string;
  price: string;
  className?: string;
  children?: ReactNode;
}

export function MatchCard({ score, reasons, producerName, location, quantity, price, className, children }: MatchCardProps) {
  const scoreColor = score >= 85 ? 'text-emerald-600' : score >= 70 ? 'text-brand-600' : 'text-amber-600';
  const scoreBg = score >= 85 ? 'bg-emerald-50' : score >= 70 ? 'bg-brand-50' : 'bg-amber-50';

  return (
    <div className={cn('rounded-2xl border border-brand-200/80 bg-white p-5 shadow-sm', className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="font-semibold text-charcoal">{producerName}</p>
          <p className="text-sm text-charcoal/60">{location}</p>
          <div className="flex gap-4 pt-1 text-xs text-charcoal/60">
            <span>Qté: {quantity}</span>
            <span>Prix: {price}</span>
          </div>
        </div>
        <div className={cn('flex flex-col items-center rounded-xl px-4 py-2', scoreBg)}>
          <span className={cn('text-2xl font-bold tabular-nums', scoreColor)}>{score}%</span>
          <span className="text-[10px] text-charcoal/60 uppercase tracking-wide">Match</span>
        </div>
      </div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-charcoal/40">Pourquoi cette correspondance</p>
      <div className="mt-2 space-y-1.5">
        {reasons.map((r, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            {r.matched ? (
              <Check className="h-4 w-4 text-emerald-500" />
            ) : (
              <span className="h-4 w-4 flex items-center justify-center text-charcoal/30">—</span>
            )}
            <span className={r.matched ? 'text-charcoal/80' : 'text-charcoal/40'}>{r.label}</span>
          </div>
        ))}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
