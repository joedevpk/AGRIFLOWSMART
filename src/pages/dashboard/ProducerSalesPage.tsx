import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LineChart, ShoppingBag, Package, Info } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardBody, EmptyState, StatCard } from '@/components/ui';
import { buttonStyles } from '@/components/ui/button-styles';
import { LoadError, OrderSkeleton } from '@/components/orders/OrderStates';
import { useAuth } from '@/contexts/auth-context';
import { useOrders } from '@/hooks/useOrders';
import { useSeo } from '@/hooks/useSeo';
import { formatDate, formatPrice, formatQuantity } from '@/lib/constants';
import { shortOrderRef } from '@/lib/order-display';
import { paidDate, SALES_PERIODS, salesInPeriod, soldProducts, totalsByCurrency, type SalesPeriod } from '@/lib/producer-insights';
import { cn } from '@/lib/utils';

const fmt = (rows: { currency: string; amount: number }[]) => (rows.length === 0 ? formatPrice(0) : rows.map((r) => formatPrice(r.amount, r.currency)).join(' + '));

/** Ventes = commandes dont le paiement est réellement encaissé (paiements de démonstration exclus). Aucun graphique : pas assez de données pour en justifier un. */
export function ProducerSalesPage() {
  useSeo({ title: 'Mes ventes | AgriFlow RDC', noindex: true });
  const { user } = useAuth();
  const { orders, loading, error, reload } = useOrders('producer', user?.id);
  const [period, setPeriod] = useState<SalesPeriod>('30d');

  const sales = useMemo(() => salesInPeriod(orders, period), [orders, period]);
  const total = useMemo(() => totalsByCurrency(sales.map((o) => ({ currency: o.currency, amount: o.total_amount }))), [sales]);
  // Passe 1 : le net n'est affiché que s'il a été réellement calculé (règle figée à la commande).
  const net = useMemo(() => totalsByCurrency(sales.filter((o) => o.seller_amount !== null).map((o) => ({ currency: o.currency, amount: o.seller_amount ?? 0 }))), [sales]);
  const commission = useMemo(() => totalsByCurrency(sales.filter((o) => o.seller_amount !== null && o.commission_status !== 'not_configured').map((o) => ({ currency: o.currency, amount: o.platform_fee }))), [sales]);
  const pendingNet = useMemo(() => sales.filter((o) => o.seller_amount === null).length, [sales]);
  const products = useMemo(() => soldProducts(sales), [sales]);

  return (
    <DashboardLayout title="Mes ventes">
      {loading ? <OrderSkeleton count={3} /> : error ? (
        <LoadError title="Impossible de charger vos ventes" message={error} onRetry={() => void reload()} />
      ) : (
        <div className="space-y-6">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Période">
            {SALES_PERIODS.map((p) => (
              <button key={p.id} type="button" aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}
                className={cn('inline-flex min-h-[44px] shrink-0 items-center rounded-full border px-4 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500', period === p.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-black/[0.08] bg-offwhite text-charcoal/70 hover:border-brand-300')}>
                {p.label}
              </button>
            ))}
          </div>

          {sales.length === 0 ? (
            <Card><CardBody><EmptyState icon={<LineChart className="h-8 w-8" />} title="Aucune vente encaissée sur cette période" description="Une vente apparaît ici lorsque le paiement de la commande est confirmé. Les paiements de démonstration ne sont jamais comptés." action={<Link to="/producer/orders" className={buttonStyles({ variant: 'outline' })}>Voir mes commandes</Link>} /></CardBody></Card>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
                <StatCard label="Total encaissé" value={fmt(total)} icon={<LineChart className="h-5 w-5" />} accent="emerald" />
                <StatCard label="Commandes payées" value={sales.length} icon={<ShoppingBag className="h-5 w-5" />} accent="brand" />
                <StatCard label="Produits vendus" value={products.length} icon={<Package className="h-5 w-5" />} accent="blue" />
                <StatCard label="Commission retenue" value={commission.length === 0 ? '—' : fmt(commission)} icon={<LineChart className="h-5 w-5" />} accent="amber" />
                <StatCard label="Net après commission" value={net.length === 0 ? '—' : fmt(net)} icon={<LineChart className="h-5 w-5" />} accent="amber" />
              </div>
              {pendingNet > 0 && <p role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{pendingNet} vente{pendingNet > 1 ? 's' : ''} sans net calculé : aucune commission n'était validée par la plateforme au moment de la commande. Le net sera communiqué après décision ; aucun montant n'est estimé ici.</p>}
              <p className="flex items-start gap-2 rounded-xl border border-black/[0.06] bg-offwhite px-4 py-3 text-xs text-charcoal/60"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />Le net = montant des produits − commission, calculé avec la règle en vigueur à la création de la commande (livraison exclue). Le versement au producteur est un processus manuel : il n'est pas automatique.</p>

              <section>
                <h2 className="mb-3 text-base font-semibold text-charcoal">Produits vendus</h2>
                <Card><CardBody className="p-0"><ul className="divide-y divide-black/[0.06]">
                  {products.map((p) => (
                    <li key={`${p.name}-${p.unit}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm"><span className="min-w-0 truncate font-medium text-charcoal">{p.name}</span><span className="shrink-0 tabular-nums text-charcoal/70">{formatQuantity(p.quantity, p.unit)}</span></li>
                  ))}
                </ul></CardBody></Card>
              </section>

              <section>
                <h2 className="mb-3 text-base font-semibold text-charcoal">Commandes payées</h2>
                <div className="space-y-2">
                  {sales.map((o) => (
                    <Link key={o.id} to={`/orders/${o.id}`} className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                      <Card hover><CardBody className="flex items-center justify-between gap-3 py-3">
                        <div className="min-w-0"><p className="font-medium tabular-nums text-charcoal">{shortOrderRef(o)}</p><p className="text-xs text-charcoal/50">Payée le {formatDate(paidDate(o))} · {o.buyer_profile?.full_name ?? '—'}</p></div>
                        <div className="shrink-0 text-right"><span className="font-semibold text-brand-700">{formatPrice(o.total_amount, o.currency)}</span><p className="text-xs text-charcoal/50">{o.seller_amount === null ? 'Net à confirmer' : `Net ${formatPrice(o.seller_amount, o.currency)}`}</p></div>
                      </CardBody></Card>
                    </Link>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}
