import { BUYER_REQUEST_COLUMNS } from '@/lib/columns';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, CreditCard, Inbox, Package, Plus, Search, ShoppingBag, ShoppingCart, Sparkles, Truck } from 'lucide-react';
import { Card, CardBody, EmptyState, ErrorState, LoadingState, StatCard } from '@/components/ui';
import { buttonStyles } from '@/components/ui/button-styles';
import { OrderStatusBadge, PaymentBadge } from '@/components/orders/StatusBadges';
import { useAuth } from '@/contexts/auth-context';
import { useCart } from '@/contexts/cart-context';
import { useOrders } from '@/hooks/useOrders';
import { supabase } from '@/lib/supabase';
import type { BuyerRequest } from '@/types';
import { formatDate, formatPrice, formatQuantity } from '@/lib/constants';
import { orderQuantitySummary, orderTitle, shortOrderRef, sumByCurrency } from '@/lib/order-display';
import { isOnlineMethod } from '@/services/paymentService';
import { cn } from '@/lib/utils';

function SectionHeader({ title, to, cta }: { title: string; to?: string; cta?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold text-charcoal sm:text-lg">{title}</h2>
      {to && cta && (
        <Link to={to} className="group inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-sm font-medium text-brand-700 hover:text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
          {cta} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

interface Priority { id: string; icon: typeof Truck; text: string; to: string; cta: string; tone: 'warn' | 'info' }

/** Tableau de bord acheteur : uniquement des données réelles (commandes, demandes, panier). Aucune recommandation inventée. */
export function BuyerDashboard() {
  const { user, profile } = useAuth();
  const { count: cartCount } = useCart();
  const { orders, loading: ordersLoading, error: ordersError, reload } = useOrders('buyer', user?.id);
  const [requests, setRequests] = useState<BuyerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(false);
    const res = await supabase.from('buyer_requests').select(BUYER_REQUEST_COLUMNS).eq('user_id', user.id).order('created_at', { ascending: false }).limit(50);
    if (res.error) setError(true);
    else setRequests((res.data as BuyerRequest[]) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  if (loading || ordersLoading) return <LoadingState />;
  if (error || ordersError) return <ErrorState message="Impossible de charger votre tableau de bord." onRetry={() => { void reload(); void load(); }} />;

  const firstName = profile?.full_name?.split(' ')[0] ?? '';
  const toPay = orders.filter((o) => isOnlineMethod(o.payment_method) && ['pending', 'failed', 'expired'].includes(o.payment_status) && o.status !== 'cancelled');
  const inDelivery = orders.filter((o) => o.status === 'in_delivery');
  const inProgress = orders.filter((o) => !['completed', 'cancelled'].includes(o.status));
  const completed = orders.filter((o) => o.status === 'completed');
  const openRequests = requests.filter((r) => r.status === 'open');

  const priorities: Priority[] = [];
  if (toPay.length > 0) priorities.push({ id: 'pay', icon: CreditCard, tone: 'warn', text: `${toPay.length} commande${toPay.length > 1 ? 's' : ''} en attente de paiement`, to: toPay.length === 1 ? `/orders/${toPay[0].id}` : '/buyer/orders', cta: 'Payer' });
  if (inDelivery.length > 0) priorities.push({ id: 'delivery', icon: Truck, tone: 'info', text: `${inDelivery.length} commande${inDelivery.length > 1 ? 's' : ''} en cours de livraison`, to: '/buyer/orders', cta: 'Suivre' });

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-charcoal sm:text-3xl">Bonjour{firstName ? `, ${firstName}` : ''}</h2>
          <p className="mt-1 text-sm text-charcoal/60">Trouvez et achetez directement auprès des producteurs.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/marketplace" className={buttonStyles({ variant: 'primary', size: 'md' })}><Search className="h-4 w-4" aria-hidden="true" /> Explorer la marketplace</Link>
          <Link to="/cart" className={buttonStyles({ variant: 'outline', size: 'md' })}><ShoppingCart className="h-4 w-4" aria-hidden="true" /> Panier{cartCount > 0 ? ` (${cartCount})` : ''}</Link>
        </div>
      </div>

      <section aria-labelledby="buyer-priorities">
        <h2 id="buyer-priorities" className="mb-3 text-base font-semibold text-charcoal sm:text-lg">Actions prioritaires</h2>
        {priorities.length === 0 ? (
          <Card><CardBody className="flex items-center gap-3 text-sm text-charcoal/70"><CheckCircle2 className="h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />Rien d'urgent : tout est à jour.</CardBody></Card>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {priorities.map((p) => (
              <li key={p.id}>
                <Link to={p.to} className={cn('group flex min-h-[64px] items-center gap-3 rounded-2xl border px-4 py-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500', p.tone === 'warn' ? 'border-accent-300 bg-accent-50 text-accent-700 hover:bg-accent-100' : 'border-brand-200 bg-brand-50 text-brand-800 hover:bg-brand-100')}>
                  <p.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 text-sm font-semibold">{p.text}</span>
                  <span className="inline-flex items-center gap-1 text-sm font-medium">{p.cta}<ArrowRight className="h-4 w-4" aria-hidden="true" /></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Commandes en cours" value={inProgress.length} icon={<ShoppingBag className="h-5 w-5" />} accent="brand" />
        <StatCard label="Commandes terminées" value={completed.length} icon={<Package className="h-5 w-5" />} accent="emerald" />
        <div className="col-span-2 lg:col-span-1">
          <StatCard label="Achats terminés" value={completed.length === 0 ? '—' : sumByCurrency(completed)} icon={<ShoppingBag className="h-5 w-5" />} accent="blue" />
        </div>
      </div>

      <section aria-labelledby="buyer-orders">
        <SectionHeader title="Commandes récentes" to="/buyer/orders" cta="Toutes mes commandes" />
        {orders.length === 0 ? (
          <Card><CardBody><EmptyState icon={<ShoppingBag className="h-8 w-8" />} title="Aucune commande" description="Vos commandes apparaîtront ici dès votre premier achat." action={<Link to="/marketplace" className={buttonStyles({ variant: 'primary', size: 'lg' })}>Explorer la marketplace</Link>} /></CardBody></Card>
        ) : (
          <ul className="space-y-3">
            {orders.slice(0, 4).map((o) => (
              <li key={o.id}>
                <Link to={`/orders/${o.id}`} className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                  <Card hover>
                    <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold tabular-nums text-charcoal/50">{shortOrderRef(o)} · {formatDate(o.created_at)}</p>
                        <p className="truncate font-semibold text-charcoal">{orderTitle(o)}</p>
                        <p className="text-sm text-charcoal/60">{orderQuantitySummary(o)} · <span className="font-semibold text-brand-700">{formatPrice(o.total_amount, o.currency)}</span></p>
                      </div>
                      <div className="flex flex-wrap gap-2"><OrderStatusBadge status={o.status} /><PaymentBadge order={o} /></div>
                    </CardBody>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="buyer-requests">
        <SectionHeader title="Mes demandes d'achat" to="/buyer/requests" cta="Gérer" />
        {requests.length === 0 ? (
          <Card><CardBody><EmptyState icon={<Sparkles className="h-8 w-8" />} title="Aucune demande" description="Décrivez votre besoin (produit, quantité, lieu) : Agri-Match vous proposera les producteurs correspondants." action={<Link to="/buyer/requests" className={buttonStyles({ variant: 'primary', size: 'lg' })}><Plus className="h-4 w-4" aria-hidden="true" /> Publier une demande</Link>} /></CardBody></Card>
        ) : (
          <>
            <p className="mb-3 flex items-center gap-2 text-sm text-charcoal/60"><Inbox className="h-4 w-4" aria-hidden="true" />{openRequests.length} demande{openRequests.length > 1 ? 's' : ''} ouverte{openRequests.length > 1 ? 's' : ''}</p>
            <ul className="space-y-3">
              {requests.slice(0, 3).map((req) => (
                <li key={req.id}>
                  <Card hover>
                    <CardBody className="flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-semibold text-charcoal">{req.product_name}</h3>
                        <p className="text-sm text-charcoal/60">{formatQuantity(req.quantity, req.unit)}{req.city ? ` · ${req.city}` : ''}</p>
                      </div>
                      <Link to={`/agrimatch/${req.id}`} className={buttonStyles({ variant: 'outline', size: 'sm' })}><Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Voir les correspondances</Link>
                    </CardBody>
                  </Card>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
