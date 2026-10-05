import { Link } from 'react-router-dom';
import { AlertTriangle, Clock } from 'lucide-react';
import { Card, CardBody } from '@/components/ui';
import { buttonStyles } from '@/components/ui/button-styles';
import { OrderQuickActions } from '@/components/orders/OrderQuickActions';
import { useLanguage } from '@/contexts/language-context';
import { useNow } from '@/hooks/useNow';
import { formatPrice } from '@/lib/constants';
import { confirmationState, formatDeadline, formatRemaining, REMAINING_REFRESH_MS } from '@/lib/order-confirmation';
import { orderQuantitySummary, orderTitle, shortOrderRef } from '@/lib/order-display';
import { cn } from '@/lib/utils';
import type { OrderWithDetails } from '@/types';

/**
 * Section très visible du tableau de bord producteur : commandes que le producteur peut et doit
 * confirmer ou refuser avant leur échéance. Le temps restant vient de `confirmation_deadline` (réel).
 * Le serveur valide chaque action (propriété, statut, paiement) — les boutons ne sont qu'une commodité.
 */
export function AttentionOrders({ orders, onDone }: { orders: OrderWithDetails[]; onDone: () => void | Promise<void> }) {
  const { t, language } = useLanguage();
  const waiting = orders
    .filter((o) => confirmationState(o).kind === 'awaiting_producer')
    .sort((a, b) => (a.confirmation_deadline ?? '').localeCompare(b.confirmation_deadline ?? ''));
  const now = useNow(REMAINING_REFRESH_MS, waiting.length > 0);

  if (waiting.length === 0) return null;
  const visible = waiting.slice(0, 5);

  return (
    <section aria-labelledby="attention-title" className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 dark:border-amber-600/60 dark:bg-amber-900/15 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-amber-700 dark:text-amber-300" aria-hidden="true" />
        <h2 id="attention-title" className="text-lg font-bold text-amber-950 dark:text-amber-50">{t('attention.title')}</h2>
        <span className="rounded-full bg-amber-200 px-2.5 py-0.5 text-xs font-bold text-amber-950" role="status">
          {waiting.length === 1 ? t('attention.one') : t('attention.many', { n: waiting.length })}
        </span>
      </div>
      <ul className="space-y-3">
        {visible.map((o) => {
          const remaining = o.confirmation_deadline ? new Date(o.confirmation_deadline).getTime() - now : 0;
          const overdue = remaining <= 0;
          return (
            <li key={o.id}>
              <Card>
                <CardBody className="space-y-3 !p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold tabular-nums text-charcoal/60">{shortOrderRef(o)}</p>
                      <p className="truncate font-semibold text-charcoal">{orderTitle(o)}</p>
                    </div>
                    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold', overdue ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-900')}>
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                      {overdue ? t('confirm.overdue') : `${t('attention.remaining')} : ${formatRemaining(remaining, t)}`}
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                    <div><dt className="text-xs text-charcoal/60">{t('attention.product')}</dt><dd className="truncate font-medium">{orderTitle(o)}</dd></div>
                    <div><dt className="text-xs text-charcoal/60">{t('attention.quantity')}</dt><dd className="font-medium">{orderQuantitySummary(o)}</dd></div>
                    <div><dt className="text-xs text-charcoal/60">{t('attention.buyer')}</dt><dd className="truncate font-medium">{o.buyer_profile?.full_name ?? '—'}</dd></div>
                    <div><dt className="text-xs text-charcoal/60">{t('attention.amount')}</dt><dd className="font-bold text-brand-700">{formatPrice(o.total_amount, o.currency)}</dd></div>
                  </dl>
                  {o.confirmation_deadline && <p className="text-xs text-charcoal/65">{t('confirm.expectedBefore', { date: formatDeadline(o.confirmation_deadline, language) })}</p>}
                  <div className="flex flex-wrap gap-2">
                    <Link to={`/orders/${o.id}`} className={buttonStyles({ variant: 'outline', size: 'sm' })} aria-label={`${t('confirm.viewOrder')} ${shortOrderRef(o)}`}>{t('confirm.viewOrder')}</Link>
                    <OrderQuickActions order={o} role="producer" onDone={onDone} />
                  </div>
                </CardBody>
              </Card>
            </li>
          );
        })}
      </ul>
      {waiting.length > visible.length && (
        <Link to="/producer/orders" className="mt-3 inline-block text-sm font-semibold text-amber-950 underline dark:text-amber-50">+ {waiting.length - visible.length}</Link>
      )}
    </section>
  );
}
