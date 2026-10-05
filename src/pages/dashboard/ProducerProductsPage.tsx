import { PRODUCT_DETAIL_COLUMNS } from '@/lib/columns';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Package, Search, Trash2, Pencil, Eye, PauseCircle, PlayCircle, Boxes } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardBody, Badge, Button, EmptyState, LoadingState, ErrorState, ConfirmDialog } from '@/components/ui';
import { buttonStyles } from '@/components/ui/button-styles';
import { useAuth } from '@/contexts/auth-context';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useSeo } from '@/hooks/useSeo';
import { supabase } from '@/lib/supabase';
import { PAGE_SIZE, pageRange, sliceHasMore } from '@/lib/pagination';
import { reportError } from '@/lib/logger';
import type { Product, ProductStatus } from '@/types';
import { formatPrice, formatQuantity, PRODUCT_STATUS_LABELS, formatDate } from '@/lib/constants';
import { getProductImage } from '@/lib/image-config';
import { normalizeText } from '@/lib/agri-match';
import { stockState, STOCK_LABELS } from '@/lib/producer-insights';
import { toast } from '@/components/ui/toast-store';
import { cn } from '@/lib/utils';

type StatusFilter = 'all' | ProductStatus;
const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'Tous' },
  { id: 'available', label: 'Disponibles' },
  { id: 'draft', label: 'Brouillons' },
  { id: 'reserved', label: 'Réservés' },
  { id: 'sold_out', label: 'Épuisés' },
];

function isFilter(v: string | null): v is StatusFilter {
  return FILTERS.some((f) => f.id === v);
}

export function ProducerProductsPage() {
  useSeo({ title: 'Mes produits | AgriFlow RDC', noindex: true });
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [toDelete, setToDelete] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);
  const debounced = useDebouncedValue(query, 200);
  const rawStatus = params.get('status');
  const filter: StatusFilter = isFilter(rawStatus) ? rawStatus : 'all';

  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const pagesRef = useRef(1);

  // Pagination réelle : `PAGE_SIZE.products` produits par page (+1 ligne pour savoir s'il y en a d'autres).
  // Rafraîchir recharge d'un coup toutes les pages déjà affichées ; `loadMore` ajoute la page suivante.
  const load = useCallback(() => {
    if (!user) return;
    const [from, to] = pageRange(0, pagesRef.current * PAGE_SIZE.products);
    supabase.from('products').select(PRODUCT_DETAIL_COLUMNS).eq('user_id', user.id).order('created_at', { ascending: false }).order('id').range(from, to).then(({ data, error: err }) => {
      if (err) { reportError('ProducerProductsPage.load', err.message); setError(err.message); }
      else {
        const { items, hasMore: more } = sliceHasMore(data as Product[] | null, pagesRef.current * PAGE_SIZE.products);
        setProducts(items); setHasMore(more); setError(null);
      }
      setLoading(false);
    });
  }, [user]);

  const loadMore = async () => {
    if (!user || loadingMore) return;
    setLoadingMore(true);
    const [from, to] = pageRange(pagesRef.current, PAGE_SIZE.products);
    const { data, error: err } = await supabase.from('products').select(PRODUCT_DETAIL_COLUMNS).eq('user_id', user.id).order('created_at', { ascending: false }).order('id').range(from, to);
    if (err) { reportError('ProducerProductsPage.loadMore', err.message); toast('error', 'Impossible de charger la suite. Réessayez.'); }
    else {
      const { items, hasMore: more } = sliceHasMore(data as Product[] | null, PAGE_SIZE.products);
      pagesRef.current += 1;
      setProducts((prev) => { const known = new Set(prev.map((x) => x.id)); return [...prev, ...items.filter((x) => !known.has(x.id))]; });
      setHasMore(more);
    }
    setLoadingMore(false);
  };

  useEffect(() => { load(); }, [load]);

  const setStatus = async (p: Product, status: ProductStatus) => {
    const { error: err } = await supabase.from('products').update({ status }).eq('id', p.id).eq('user_id', p.user_id);
    if (err) { toast('error', 'Le statut n\'a pas pu être modifié. Réessayez.'); return; }
    toast('success', status === 'available' ? 'Production remise en vente.' : 'Production retirée de la vente.');
    load();
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    const { error: err } = await supabase.from('products').delete().eq('id', id);
    setDeleting(false);
    setToDelete(null);
    if (err) {
      toast('error', err.code === '23503'
        ? 'Cette production est liée à des commandes : retirez-la de la vente plutôt que de la supprimer.'
        : 'Impossible de supprimer cette production.');
      return;
    }
    toast('success', 'Production supprimée.');
    load();
  };

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: products.length, available: 0, draft: 0, reserved: 0, sold_out: 0 };
    for (const p of products) c[p.status] += 1;
    return c;
  }, [products]);

  const visible = useMemo(() => {
    const q = normalizeText(debounced);
    return products.filter((p) => (filter === 'all' || p.status === filter) && (!q || normalizeText(`${p.name} ${p.variety ?? ''} ${p.city ?? ''}`).includes(q)));
  }, [products, filter, debounced]);

  const setFilter = (id: StatusFilter) => {
    const next = new URLSearchParams(params);
    if (id === 'all') next.delete('status'); else next.set('status', id);
    setParams(next, { replace: true });
  };

  if (loading) return <DashboardLayout title="Mes produits"><LoadingState /></DashboardLayout>;
  if (error) return <DashboardLayout title="Mes produits"><ErrorState message={error} onRetry={load} /></DashboardLayout>;

  const renderActions = (p: Product) => (
    <div className="flex flex-wrap gap-1.5">
      <Link to={`/producer/products/${p.id}/edit`} className={buttonStyles({ variant: 'outline', size: 'sm' })}><Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Modifier</Link>
      <Link to={`/producer/products/${p.id}/edit`} className={buttonStyles({ variant: 'ghost', size: 'sm' })}><Boxes className="h-3.5 w-3.5" aria-hidden="true" /> Stock</Link>
      {p.status === 'available' && <Link to={`/marketplace/${p.id}`} className={buttonStyles({ variant: 'ghost', size: 'sm' })}><Eye className="h-3.5 w-3.5" aria-hidden="true" /> Voir</Link>}
      {p.status === 'available' ? (
        <Button variant="ghost" size="sm" onClick={() => void setStatus(p, 'sold_out')}><PauseCircle className="h-3.5 w-3.5" aria-hidden="true" /> Mettre en pause</Button>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => void setStatus(p, 'available')}><PlayCircle className="h-3.5 w-3.5" aria-hidden="true" /> Remettre en vente</Button>
      )}
      <Button variant="ghost" size="sm" className="text-rose-600 hover:bg-rose-50" aria-label={`Supprimer ${p.name}`} onClick={() => setToDelete(p)}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Supprimer</Button>
    </div>
  );

  const renderBadges = (p: Product) => (
    <div className="flex flex-wrap gap-1.5">
      <Badge variant={p.status === 'available' ? 'success' : 'neutral'} dot>{PRODUCT_STATUS_LABELS[p.status]}</Badge>
      {stockState(p) === 'out_of_stock' && <Badge variant="warning">{STOCK_LABELS.out_of_stock}</Badge>}
    </div>
  );

  return (
    <DashboardLayout title="Mes produits">
      <ConfirmDialog
        open={toDelete !== null}
        destructive
        loading={deleting}
        title="Supprimer cette production ?"
        description={toDelete ? `« ${toDelete.name} » sera supprimée définitivement. Cette action est irréversible.` : undefined}
        confirmLabel="Supprimer"
        onCancel={() => setToDelete(null)}
        onConfirm={() => { if (toDelete) void handleDelete(toDelete.id); }}
      />
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal/40" aria-hidden="true" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un produit, une variété, une ville" aria-label="Rechercher dans mes produits"
              className="min-h-[44px] w-full rounded-xl border border-black/[0.1] bg-offwhite pl-9 pr-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" />
          </div>
          <Link to="/producer/products/new" className={buttonStyles()}><Plus className="h-4 w-4" aria-hidden="true" /> Ajouter un produit</Link>
        </div>

        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filtrer par statut">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}
              className={cn('inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500', filter === f.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-black/[0.08] bg-offwhite text-charcoal/70 hover:border-brand-300')}>
              {f.label}<span className={cn('rounded-full px-1.5 text-xs tabular-nums', filter === f.id ? 'bg-white/20' : 'bg-black/[0.06]')}>{counts[f.id]}</span>
            </button>
          ))}
        </div>

        {products.length === 0 ? (
          <Card><CardBody><EmptyState icon={<Package className="h-8 w-8" />} title="Vous n'avez encore aucun produit publié." description="Publiez votre première production pour la rendre visible par les acheteurs sur la marketplace." action={<Link to="/producer/products/new" className={buttonStyles()}><Plus className="h-4 w-4" aria-hidden="true" /> Ajouter mon premier produit</Link>} /></CardBody></Card>
        ) : visible.length === 0 ? (
          <Card><CardBody><EmptyState icon={<Search className="h-8 w-8" />} title="Aucun produit ne correspond" description="Modifiez votre recherche ou le filtre de statut." action={<Button variant="outline" onClick={() => { setQuery(''); setFilter('all'); }}>Réinitialiser</Button>} /></CardBody></Card>
        ) : (
          <>
            {/* Mobile : cartes verticales */}
            <div className="space-y-3 md:hidden">
              {visible.map((p) => (
                <Card key={p.id}>
                  <div className="flex gap-3 p-3">
                    <img src={p.images?.[0] || getProductImage(p.name)} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover" loading="lazy" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-charcoal">{p.name}</p>
                      {p.variety && <p className="truncate text-xs text-charcoal/50">Variété : {p.variety}</p>}
                      <p className="text-sm text-charcoal/60">{formatQuantity(p.quantity, p.unit)}</p>
                      <p className="font-bold text-brand-700">{formatPrice(p.price, p.currency)}</p>
                      <div className="mt-1.5">{renderBadges(p)}</div>
                    </div>
                  </div>
                  <div className="border-t border-black/[0.06] p-3">{renderActions(p)}</div>
                </Card>
              ))}
            </div>

            {/* Desktop : tableau */}
            <Card className="hidden overflow-hidden md:block">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <caption className="sr-only">Mes produits</caption>
                  <thead className="border-b border-black/[0.06] bg-cream/60 text-xs uppercase tracking-wide text-charcoal/50">
                    <tr><th scope="col" className="px-4 py-3 font-semibold">Produit</th><th scope="col" className="px-4 py-3 font-semibold">Stock</th><th scope="col" className="px-4 py-3 font-semibold">Prix</th><th scope="col" className="px-4 py-3 font-semibold">Statut</th><th scope="col" className="px-4 py-3 font-semibold">Actions</th></tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.06]">
                    {visible.map((p) => (
                      <tr key={p.id} className="align-middle">
                        <td className="px-4 py-3"><div className="flex items-center gap-3"><img src={p.images?.[0] || getProductImage(p.name)} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" loading="lazy" /><div className="min-w-0"><p className="max-w-[14rem] truncate font-semibold text-charcoal">{p.name}</p><p className="text-xs text-charcoal/50">{p.city || p.province || '—'} · dispo. {formatDate(p.availability_date)}</p></div></div></td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-charcoal/80">{formatQuantity(p.quantity, p.unit)}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-semibold text-brand-700">{formatPrice(p.price, p.currency)}</td>
                        <td className="px-4 py-3">{renderBadges(p)}</td>
                        <td className="px-4 py-3">{renderActions(p)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
        {hasMore && (
          <div className="mt-4 flex justify-center">
            <Button variant="outline" loading={loadingMore} onClick={() => void loadMore()}>Voir plus de produits</Button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
