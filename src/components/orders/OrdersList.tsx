import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import type { OrderStatus, OrderWithDetails } from '@/types';
import { formatDate, formatPrice } from '@/lib/constants';
import { orderQuantitySummary, orderThumb, orderTitle, shortOrderRef } from '@/lib/order-display';
import { cn } from '@/lib/utils';
import { OrderCard } from './OrderCard';
import { OrderStatusBadge, PaymentBadge } from './StatusBadges';

export interface OrderFilterDef<Id extends string> {
  id: Id;
  label: string;
  statuses: OrderStatus[] | null;
}

interface OrdersListProps<Id extends string> {
  orders: OrderWithDetails[];
  viewer: 'buyer' | 'producer';
  filters: OrderFilterDef<Id>[];
  /** Actions rapides d'une commande (le serveur valide chaque transition). */
  renderActions: (order: OrderWithDetails) => ReactNode;
  /** Affiché quand le filtre actif ne correspond à aucune commande. */
  emptyFiltered: ReactNode;
}

/**
 * Liste de commandes partagée acheteur/producteur : filtres par statut réel,
 * tableau sur desktop (md+), cartes verticales sur mobile.
 */
export function OrdersList<Id extends string>({ orders, viewer, filters, renderActions, emptyFiltered }: OrdersListProps<Id>) {
  const [filter, setFilter] = useState<Id>(filters[0].id);
  const matches = (status: OrderStatus, id: Id) => {
    const def = filters.find((f) => f.id === id);
    return !def?.statuses || def.statuses.includes(status);
  };
  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const f of filters) result[f.id] = orders.filter((o) => !f.statuses || f.statuses.includes(o.status)).length;
    return result;
  }, [orders, filters]);
  const visible = useMemo(() => orders.filter((o) => matches(o.status, filter)), [orders, filter]); // eslint-disable-line react-hooks/exhaustive-deps
  const counterpartLabel = viewer === 'producer' ? 'Acheteur' : 'Producteur';

  return (
    <div className="space-y-4">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filtrer les commandes">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              'inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
              filter === f.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-black/[0.08] bg-offwhite text-charcoal/70 hover:border-brand-300 dark:border-white/10',
            )}
          >
            {f.label}
            <span className={cn('rounded-full px-1.5 text-xs tabular-nums', filter === f.id ? 'bg-white/20' : 'bg-black/[0.06] dark:bg-white/10')}>{counts[f.id]}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        emptyFiltered
      ) : (
        <>
          {/* Desktop : tableau */}
          <Card className="hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <caption className="sr-only">Liste des commandes</caption>
                <thead className="border-b border-black/[0.06] bg-cream/60 text-xs uppercase tracking-wide text-charcoal/50 dark:border-white/10 dark:bg-white/5">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">Commande</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Produits</th>
                    <th scope="col" className="px-4 py-3 font-semibold">{counterpartLabel}</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Montant</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Paiement</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Statut</th>
                    <th scope="col" className="px-4 py-3 font-semibold"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.06] dark:divide-white/10">
                  {visible.map((o) => {
                    const other = viewer === 'producer' ? o.buyer_profile : o.producer_profile;
                    return (
                      <tr key={o.id} className="align-middle hover:bg-cream/40 dark:hover:bg-white/5">
                        <td className="px-4 py-3">
                          <p className="font-semibold tabular-nums text-charcoal">{shortOrderRef(o)}</p>
                          <p className="text-xs text-charcoal/50">{formatDate(o.created_at)}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <img src={orderThumb(o)} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" loading="lazy" />
                            <div className="min-w-0">
                              <p className="max-w-[220px] truncate font-medium text-charcoal">{orderTitle(o)}</p>
                              <p className="text-xs text-charcoal/50">{orderQuantitySummary(o)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="max-w-[160px] truncate px-4 py-3 text-charcoal/70">{other?.full_name ?? '—'}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-brand-700">{formatPrice(o.total_amount, o.currency)}</td>
                        <td className="px-4 py-3"><PaymentBadge order={o} /></td>
                        <td className="px-4 py-3"><OrderStatusBadge status={o.status} /></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {renderActions(o)}
                            <Link to={`/orders/${o.id}`} aria-label={`Ouvrir la commande ${shortOrderRef(o)}`} className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-sm font-semibold text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                              Voir <ChevronRight className="h-4 w-4" aria-hidden="true" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile : cartes verticales */}
          <div className="space-y-4 md:hidden">
            {visible.map((o) => (
              <OrderCard key={o.id} order={o} viewer={viewer} actions={renderActions(o)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
