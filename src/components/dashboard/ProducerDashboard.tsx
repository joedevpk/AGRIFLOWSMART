import { PRODUCT_DETAIL_COLUMNS, BUYER_REQUEST_COLUMNS } from '@/lib/columns';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus, MapPin, ShoppingBag, Sparkles, CalendarDays, Package, TrendingUp, Boxes, ArrowRight, AlertTriangle,
  BookOpen, Inbox, FileEdit, CheckCircle2,
} from 'lucide-react';
import { Badge, Card, CardBody, EmptyState, ErrorState, LoadingState, StatCard } from '@/components/ui';
import { buttonStyles } from '@/components/ui/button-styles';
import { AttentionOrders } from '@/components/dashboard/AttentionOrders';
import { UnavailableBanner } from '@/components/availability/ProducerAvailabilityCard';
import { confirmationState } from '@/lib/order-confirmation';
import { OrderQuickActions } from '@/components/orders/OrderQuickActions';
import { OrderStatusBadge } from '@/components/orders/StatusBadges';
import { ActionCenter, type ActionItem } from '@/components/agri/ActionCenter';
import { useAuth } from '@/contexts/auth-context';
import { useOrders } from '@/hooks/useOrders';
import { useProgress, cropProgress } from '@/hooks/useProgress';
import { supabase } from '@/lib/supabase';
import type { BuyerRequest, Product } from '@/types';
import type { Plot } from '@/types/agri';
import { cachedPlots } from '@/services/agriService';
import { bestOfferForRequest } from '@/lib/agri-match';
import { getCrop } from '@/lib/agri/crops';
import { getZone, findZoneByName } from '@/lib/agri/zones';
import { cropPhases } from '@/lib/agri/calendar';
import { formatDate, formatPrice, formatQuantity, PRODUCT_STATUS_LABELS } from '@/lib/constants';
import { getProductImage } from '@/lib/image-config';
import { orderQuantitySummary, orderTitle, shortOrderRef } from '@/lib/order-display';
import { bucketProducts, isRealSale, stockState, STOCK_LABELS, totalsByCurrency } from '@/lib/producer-insights';
import { PLOT_STATUS_LABELS } from '@/types/agri';
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

interface Priority { id: string; icon: typeof AlertTriangle; text: string; to: string; cta: string; tone: 'warn' | 'info' }

/** Tableau de bord producteur : chaque chiffre, chaque alerte vient de Supabase (ou des parcelles enregistrées sur l'appareil). */
export function ProducerDashboard() {
  const { user, profile } = useAuth();
  const { orders, loading: ordersLoading, error: ordersError, reload, refresh } = useOrders('producer', user?.id);
  const [products, setProducts] = useState<Product[]>([]);
  const [requests, setRequests] = useState<BuyerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { map: progressMap } = useProgress();

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(false);
    const [prodRes, reqRes] = await Promise.all([
      supabase.from('products').select(PRODUCT_DETAIL_COLUMNS).eq('user_id', user.id).order('created_at', { ascending: false }).limit(200),
      supabase.from('buyer_requests').select(BUYER_REQUEST_COLUMNS).eq('status', 'open').neq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
    ]);
    if (prodRes.error || reqRes.error) setError(true);
    else {
      setProducts((prodRes.data as Product[]) ?? []);
      setRequests((reqRes.data as BuyerRequest[]) ?? []);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const plots: Plot[] = useMemo(() => (user ? cachedPlots(user.id) : []), [user]);
  const buckets = useMemo(() => bucketProducts(products), [products]);

  const toConfirm = orders.filter((o) => confirmationState(o).kind === 'awaiting_producer');
  const toPrepare = orders.filter((o) => o.status === 'confirmed' || o.status === 'preparing');
  const ready = orders.filter((o) => o.status === 'ready');
  const actionable = orders.filter((o) => ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status));
  const inProgress = orders.filter((o) => !['completed', 'cancelled'].includes(o.status));

  const revenueRows = orders.filter((o) => o.status === 'completed' && isRealSale(o)).map((o) => ({ currency: o.currency, amount: o.total_amount }));
  const revenue = totalsByCurrency(revenueRows);

  const matches = useMemo(
    () => requests
      .map((req) => ({ req, best: bestOfferForRequest(req, buckets.published) }))
      .filter((m): m is { req: BuyerRequest; best: NonNullable<typeof m.best> } => m.best !== null)
      .sort((a, b) => b.best.result.score - a.best.result.score)
      .slice(0, 3),
    [requests, buckets.published],
  );

  const activePlots = plots.filter((p) => p.status !== 'harvested' && p.status !== 'resting');
  const currentMonth = new Date().getMonth() + 1;

  const priorities: Priority[] = [];
  if (toConfirm.length > 0) priorities.push({ id: 'confirm', icon: ShoppingBag, tone: 'warn', text: `${toConfirm.length} commande${toConfirm.length > 1 ? 's' : ''} à confirmer`, to: '/producer/orders', cta: 'Traiter' });
  if (ready.length > 0) priorities.push({ id: 'ready', icon: ShoppingBag, tone: 'info', text: `${ready.length} commande${ready.length > 1 ? 's' : ''} prête${ready.length > 1 ? 's' : ''} à expédier`, to: '/producer/orders', cta: 'Voir' });
  if (buckets.availableButEmpty.length > 0) priorities.push({ id: 'empty', icon: AlertTriangle, tone: 'warn', text: `${buckets.availableButEmpty.length} offre${buckets.availableButEmpty.length > 1 ? 's' : ''} affichée${buckets.availableButEmpty.length > 1 ? 's' : ''} « Disponible » sans stock`, to: '/producer/products', cta: 'Corriger' });
  if (buckets.drafts.length > 0) priorities.push({ id: 'drafts', icon: FileEdit, tone: 'info', text: `${buckets.drafts.length} brouillon${buckets.drafts.length > 1 ? 's' : ''} à publier`, to: '/producer/products?status=draft', cta: 'Publier' });
  if (matches.length > 0) priorities.push({ id: 'match', icon: Sparkles, tone: 'info', text: `${matches.length} demande${matches.length > 1 ? 's' : ''} Agri-Match correspond${matches.length > 1 ? 'ent' : ''} à vos offres`, to: '/producer/requests', cta: 'Consulter' });

  // « À faire aujourd'hui » : données réelles uniquement.
  const todo: ActionItem[] = [];
  if (toConfirm.length > 0) todo.push({ id: 'todo-confirm', text: `Confirmer ${toConfirm.length} commande${toConfirm.length > 1 ? 's' : ''} en attente`, to: '/producer/orders' });
  if (buckets.availableButEmpty.length > 0) todo.push({ id: 'todo-stock', text: 'Mettre à jour le stock des offres épuisées', to: '/producer/products' });
  if (!profile?.phone || !profile?.city || !profile?.bio) todo.push({ id: 'todo-profile', text: 'Finaliser votre profil (téléphone, ville, présentation)', to: '/profile' });
  if (plots.length === 0) todo.push({ id: 'todo-plot', text: 'Enregistrer votre première parcelle', to: '/plots' });
  for (const plot of activePlots) {
    const crop = getCrop(plot.planned_crop ?? plot.current_crop ?? '');
    if (!crop) continue;
    const zone = getZone(plot.zone_id) ?? findZoneByName(plot.locality);
    if (zone) {
      const phases = cropPhases(crop, zone);
      if (phases.harvest.includes(currentMonth)) todo.push({ id: `harvest-${plot.id}`, text: `Récolte de ${crop.name} prévue ce mois-ci sur « ${plot.name} » : préparez votre publication`, to: `/plots/${plot.id}` });
      else if (phases.care.includes(currentMonth)) todo.push({ id: `care-${plot.id}`, text: `Entretenir la parcelle « ${plot.name} » (${crop.name})`, to: `/plots/${plot.id}` });
    }
    if (cropProgress(progressMap, crop.id).nextIndex !== -1) todo.push({ id: `guide-${plot.id}`, text: `Lire l'étape suivante du guide « ${crop.name} »`, to: `/agriguide/${crop.id}` });
  }

  if (loading || ordersLoading) return <LoadingState />;
  if (error || ordersError) return <ErrorState message="Impossible de charger votre tableau de bord." onRetry={() => { void reload(); void load(); }} />;

  const firstName = profile?.full_name?.split(' ')[0] ?? '';
  const ordersToHandle = actionable.slice(0, 4);

  return (
    <div className="space-y-8">
      <UnavailableBanner />
      <div>
        <h2 className="text-2xl font-bold text-charcoal sm:text-3xl">Bonjour{firstName ? `, ${firstName}` : ''}</h2>
        <p className="mt-1 text-sm text-charcoal/60">Voici ce qui se passe dans votre activité.</p>
      </div>

      <AttentionOrders orders={orders} onDone={refresh} />

      {/* Actions prioritaires */}
      <section>
        <SectionHeader title="Actions prioritaires" />
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

      {/* Actions rapides */}
      <section aria-label="Actions rapides" className="flex flex-wrap gap-2 sm:gap-3">
        <Link to="/producer/products/new" className={buttonStyles({ variant: 'primary' })}><Plus className="h-4 w-4" aria-hidden="true" /> Ajouter un produit</Link>
        <Link to="/plots" className={buttonStyles({ variant: 'outline' })}><Plus className="h-4 w-4" aria-hidden="true" /> Ajouter une parcelle</Link>
        <Link to="/producer/orders" className={buttonStyles({ variant: 'outline' })}><ShoppingBag className="h-4 w-4" aria-hidden="true" /> Voir mes commandes</Link>
        <Link to="/producer/requests" className={buttonStyles({ variant: 'outline' })}><Sparkles className="h-4 w-4" aria-hidden="true" /> Voir Agri-Match</Link>
        <Link to="/calendar" className={buttonStyles({ variant: 'outline' })}><CalendarDays className="h-4 w-4" aria-hidden="true" /> Mon calendrier</Link>
      </section>

      {/* Indicateurs */}
      <section aria-label="Indicateurs" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Produits actifs" value={buckets.published.length} icon={<Package className="h-5 w-5" />} accent="brand" />
        <StatCard label="Commandes en cours" value={inProgress.length} icon={<ShoppingBag className="h-5 w-5" />} accent="blue" />
        <StatCard label="Ventes encaissées" value={revenue.length === 0 ? formatPrice(0) : revenue.map((r) => formatPrice(r.amount, r.currency)).join(' + ')} icon={<TrendingUp className="h-5 w-5" />} accent="emerald" />
        <StatCard label="Produits en rupture" value={buckets.outOfStock.length} icon={<Boxes className="h-5 w-5" />} accent={buckets.outOfStock.length > 0 ? 'amber' : 'brand'} />
      </section>

      {/* Commandes à traiter */}
      <section>
        <SectionHeader title="Commandes à traiter" to="/producer/orders" cta="Toutes les commandes" />
        {ordersToHandle.length === 0 ? (
          <Card><CardBody><EmptyState icon={<ShoppingBag className="h-8 w-8" />} title={orders.length === 0 ? 'Vos commandes apparaîtront ici.' : 'Aucune commande à traiter'} description={orders.length === 0 ? 'Dès qu\'un acheteur commande l\'une de vos productions, vous la retrouverez ici.' : 'Toutes vos commandes en cours sont à jour.'} /></CardBody></Card>
        ) : (
          <div className="space-y-3">
            {ordersToHandle.map((o) => (
              <Card key={o.id}>
                <CardBody className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold tabular-nums text-charcoal/50">{shortOrderRef(o)} · {formatDate(o.created_at)}</p>
                      <p className="truncate font-semibold text-charcoal">{orderTitle(o)}</p>
                      <p className="text-sm text-charcoal/60">{orderQuantitySummary(o)} · <span className="font-semibold text-brand-700">{formatPrice(o.total_amount, o.currency)}</span></p>
                      <p className="text-xs text-charcoal/50">Acheteur : {o.buyer_profile?.full_name ?? '—'}</p>
                    </div>
                    <OrderStatusBadge status={o.status} />
                  </div>
                  <div className="flex flex-wrap gap-2 border-t border-black/[0.06] pt-3">
                    <Link to={`/orders/${o.id}`} className={buttonStyles({ variant: 'ghost', size: 'sm' })}>Voir la commande</Link>
                    <OrderQuickActions order={o} role="producer" onDone={refresh} />
                  </div>
                </CardBody>
              </Card>
            ))}
            {actionable.length > ordersToHandle.length && <p className="text-xs text-charcoal/50">+ {actionable.length - ordersToHandle.length} autre(s) commande(s) à traiter.</p>}
          </div>
        )}
        {toPrepare.length > 0 && toConfirm.length === 0 && <p className="mt-2 text-xs text-charcoal/50">{toPrepare.length} commande(s) confirmée(s) en préparation.</p>}
      </section>

      {/* Mes produits */}
      <section>
        <SectionHeader title="Mes produits" to="/producer/products" cta="Gérer" />
        {products.length === 0 ? (
          <Card><CardBody><EmptyState icon={<Package className="h-8 w-8" />} title="Vous n'avez encore aucun produit publié." description="Publiez votre première production pour la rendre visible par les acheteurs." action={<Link to="/producer/products/new" className={buttonStyles()}><Plus className="h-4 w-4" aria-hidden="true" /> Ajouter mon premier produit</Link>} /></CardBody></Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {products.slice(0, 6).map((p) => {
              const st = stockState(p);
              return (
                <Card key={p.id} className="overflow-hidden">
                  <div className="flex gap-3 p-3">
                    <img src={p.images?.[0] || getProductImage(p.name)} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover" loading="lazy" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-charcoal">{p.name}</p>
                      <p className="text-sm text-charcoal/60">{formatQuantity(p.quantity, p.unit)} · <span className="font-semibold text-brand-700">{formatPrice(p.price, p.currency)}</span></p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Badge variant={p.status === 'available' ? 'success' : 'neutral'} dot>{PRODUCT_STATUS_LABELS[p.status]}</Badge>
                        {st === 'out_of_stock' && <Badge variant="warning">{STOCK_LABELS[st]}</Badge>}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 border-t border-black/[0.06] px-3 py-2">
                    <Link to={`/producer/products/${p.id}/edit`} className={buttonStyles({ variant: 'ghost', size: 'sm' })}>Modifier</Link>
                    {p.status === 'available' && <Link to={`/marketplace/${p.id}`} className={buttonStyles({ variant: 'ghost', size: 'sm' })}>Voir</Link>}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Mon agriculture */}
      <section>
        <SectionHeader title="Mon agriculture" />
        {plots.length === 0 ? (
          <Card><CardBody><EmptyState icon={<MapPin className="h-8 w-8" />} title="Commencez par enregistrer votre première parcelle." description="Vos parcelles alimentent le calendrier agricole et les conseils AgriGuide." action={<Link to="/plots" className={buttonStyles()}><Plus className="h-4 w-4" aria-hidden="true" /> Ajouter une parcelle</Link>} /></CardBody></Card>
        ) : (
          <Card>
            <CardBody className="space-y-4">
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div><dt className="text-charcoal/50">Parcelles</dt><dd className="text-xl font-bold tabular-nums text-charcoal">{plots.length}</dd></div>
                <div><dt className="text-charcoal/50">Parcelles actives</dt><dd className="text-xl font-bold tabular-nums text-charcoal">{activePlots.length}</dd></div>
              </dl>
              <ul className="divide-y divide-black/[0.06] text-sm">
                {plots.slice(0, 3).map((p) => {
                  const crop = getCrop(p.planned_crop ?? p.current_crop ?? '');
                  return (
                    <li key={p.id}>
                      <Link to={`/plots/${p.id}`} className="flex min-h-[44px] items-center justify-between gap-3 py-2 hover:text-brand-700">
                        <span className="min-w-0 truncate font-medium">{p.name}{crop ? ` · ${crop.name}` : ''}</span>
                        <Badge variant="neutral">{PLOT_STATUS_LABELS[p.status]}</Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          </Card>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to="/plots" className={buttonStyles({ variant: 'outline', size: 'sm' })}><MapPin className="h-4 w-4" aria-hidden="true" /> Voir mes parcelles</Link>
          <Link to="/calendar" className={buttonStyles({ variant: 'outline', size: 'sm' })}><CalendarDays className="h-4 w-4" aria-hidden="true" /> Voir le calendrier</Link>
          <Link to="/agriguide" className={buttonStyles({ variant: 'outline', size: 'sm' })}><BookOpen className="h-4 w-4" aria-hidden="true" /> Consulter AgriGuide</Link>
        </div>
      </section>

      {/* Opportunités */}
      <section>
        <SectionHeader title="Opportunités pour vous" to="/producer/requests" cta="Toutes les demandes" />
        {matches.length === 0 ? (
          <Card><CardBody><EmptyState icon={<Inbox className="h-8 w-8" />} title="Aucune demande correspondante" description="Quand un acheteur recherchera un produit que vous proposez, la demande apparaîtra ici." /></CardBody></Card>
        ) : (
          <div className="space-y-3">
            {matches.map(({ req, best }) => (
              <Card key={req.id}>
                <CardBody className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-charcoal">Recherche : {req.product_name}</p>
                    <p className="text-sm text-charcoal/60">{formatQuantity(req.quantity, req.unit)}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-charcoal/50">
                      {req.city && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden="true" /> {req.city}</span>}
                      {req.budget && <span>Budget : {formatPrice(req.budget, req.currency)}</span>}
                      {req.desired_date && <span>Avant le {formatDate(req.desired_date)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Score réellement calculé par calculateMatchScore (indicatif). */}
                    <div className="text-center"><span className="text-xl font-bold tabular-nums text-brand-600">{best.result.score}%</span><p className="text-[10px] text-charcoal/45">score indicatif</p></div>
                    <Link to="/producer/requests" className={buttonStyles({ variant: 'outline', size: 'sm' })}>Voir la demande</Link>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </section>

      <ActionCenter items={todo.slice(0, 6)} emptyText="Tout est à jour." />
    </div>
  );
}
