import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSeo } from '@/hooks/useSeo';
import { PAGE_IMAGES } from '@/lib/image-config';
import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, LayoutGrid, List, X } from 'lucide-react';
import { Header, Footer } from '@/components/layout/Header';
import { ProductCard } from '@/components/ui/ProductCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { ErrorState } from '@/components/ui/States';
import { EmptyMarketplace, MarketplaceSkeleton } from '@/components/marketplace/MarketplaceStates';
import { Chip, FilterGroups, FilterSheet } from '@/components/marketplace/MarketplaceFilters';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useFavorites } from '@/hooks/useFavorites';
import { fetchMarketplacePage } from '@/lib/marketplace-query';
import { PAGE_SIZE } from '@/lib/pagination';
import { reportError } from '@/lib/logger';
import type { ProductWithProfile } from '@/types';
import { PROVINCES } from '@/lib/constants';
import {
  AVAILABILITY_OPTIONS, MARKET_CHIPS, PRICE_RANGES, QUANTITY_OPTIONS, SORT_OPTIONS,
  categoryName, countAdvancedFilters, hasAnyFilter, parseFilters,
  type MarketFilters,
} from '@/lib/marketplace';
import { cn } from '@/lib/utils';

export function MarketplacePage() {
  const favorites = useFavorites();
  useSeo({
    title: 'Marketplace agricole RDC | AgriFlow',
    description: 'Parcourez les productions agricoles proposées directement par les producteurs et coopératives de RDC : maïs, manioc, riz, légumes et plus.',
    image: PAGE_IMAGES.marketplace.url,
    imageAlt: PAGE_IMAGES.marketplace.alt,
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(searchParams), [searchParams]);

  const [products, setProducts] = useState<ProductWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const pageRef = useRef(0);
  const requestRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [sheetOpen, setSheetOpen] = useState(false);

  /* -------- Recherche avec debounce (l'URL reste la source de vérité) -------- */
  const [searchInput, setSearchInput] = useState(filters.q);
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  const updateParams = useCallback((patch: Partial<MarketFilters>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      (Object.entries(patch) as [keyof MarketFilters, string][]).forEach(([k, v]) => {
        if (v && !(k === 'sort' && v === 'recent')) next.set(k, v);
        else next.delete(k);
      });
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    if (debouncedSearch.trim() !== filters.q) updateParams({ q: debouncedSearch.trim() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // Synchronise le champ quand l'URL change de l'extérieur (lien accueil, réinitialisation…).
  useEffect(() => {
    setSearchInput((cur) => (cur.trim() === filters.q ? cur : filters.q));
  }, [filters.q]);

  const resetAll = () => {
    setSearchInput('');
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  /* -------------------------------- Données -------------------------------- */
  // Chaque nouvelle requête invalide la précédente (requestRef) : une réponse tardive d'une ancienne recherche est ignorée.
  const filterKey = JSON.stringify(filters);
  const load = useCallback(async (append = false) => {
    const requestId = ++requestRef.current;
    const page = append ? pageRef.current + 1 : 0;
    if (append) setLoadingMore(true); else { setLoading(true); setError(null); }
    const res = await fetchMarketplacePage(JSON.parse(filterKey) as MarketFilters, page, PAGE_SIZE.marketplace, page === 0);
    if (requestId !== requestRef.current) return;
    if (res.error) {
      reportError('MarketplacePage.load', res.error, { fn: 'fetchMarketplacePage' });
      setError(res.error);
    } else {
      pageRef.current = page;
      setProducts((prev) => (append ? [...prev, ...(res.data as unknown as ProductWithProfile[])] : (res.data as unknown as ProductWithProfile[])));
      setHasMore(res.hasMore);
      if (page === 0) setTotal(res.total);
      setError(null);
    }
    setLoading(false);
    setLoadingMore(false);
  }, [filterKey]);

  useEffect(() => { void load(false); }, [load]);

  // Les produits reçus sont déjà filtrés et triés par le serveur.
  const results = products;
  const provinces = useMemo(() => [...PROVINCES] as string[], []);

  const advancedCount = countAdvancedFilters(filters);
  const anyFilter = hasAnyFilter(filters);

  /* --------------------------- Tags de filtres actifs --------------------------- */
  const activeTags: { key: keyof MarketFilters; label: string }[] = [];
  if (filters.province) activeTags.push({ key: 'province', label: filters.province });
  if (filters.category) activeTags.push({ key: 'category', label: categoryName(filters.category) });
  if (filters.price) activeTags.push({ key: 'price', label: PRICE_RANGES.find((r) => r.id === filters.price)?.label ?? filters.price });
  if (filters.avail) activeTags.push({ key: 'avail', label: AVAILABILITY_OPTIONS.find((o) => o.id === filters.avail)?.label ?? filters.avail });
  if (filters.qty) activeTags.push({ key: 'qty', label: QUANTITY_OPTIONS.find((o) => o.id === filters.qty)?.label ?? filters.qty });

  return (
    <div className="min-h-screen bg-cream dark:bg-charcoal transition-colors">
      <Header />

      {/* En-tête */}
      <PageHeader
        title="Marketplace agricole"
        description="Découvrez des produits proposés directement par les producteurs."
      >
        <div className="relative max-w-2xl">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-charcoal/35" aria-hidden="true" />
          <input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            aria-label="Rechercher un produit, un lieu ou un producteur"
            placeholder="Rechercher maïs, manioc, tomate..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full rounded-2xl border border-black/[0.08] bg-offwhite py-3.5 pl-12 pr-12 text-base text-charcoal shadow-sm placeholder:text-sm placeholder:text-charcoal/35 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 [&::-webkit-search-cancel-button]:hidden"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput('')}
              aria-label="Effacer la recherche"
              className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-charcoal/40 hover:bg-black/5 hover:text-charcoal"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </PageHeader>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-5">
        {/* Puces de catégorie — défilement horizontal */}
        <div
          role="group"
          aria-label="Catégories de produits"
          className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 scrollbar-hide"
        >
          <Chip active={!filters.type} onClick={() => updateParams({ type: '' })}>Tout</Chip>
          {MARKET_CHIPS.map((c) => (
            <Chip key={c.id} active={filters.type === c.id} onClick={() => updateParams({ type: filters.type === c.id ? '' : c.id })}>
              {c.label}
            </Chip>
          ))}
        </div>

        {/* Barre d'outils */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm text-charcoal/55" aria-live="polite">
            {loading ? 'Chargement…' : (() => { const n = total ?? results.length; return `${n} production${n > 1 ? 's' : ''} disponible${n > 1 ? 's' : ''}`; })()}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="lg:hidden inline-flex min-h-[40px] items-center gap-2 rounded-full border border-black/[0.08] bg-offwhite px-4 text-sm font-medium text-charcoal"
            >
              <SlidersHorizontal className="h-4 w-4" /> Filtres
              {advancedCount > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-400 px-1 text-xs font-bold text-charcoal">{advancedCount}</span>}
            </button>
            <label className="flex items-center gap-2 text-sm text-charcoal/60">
              <span className="sr-only sm:not-sr-only">Trier par</span>
              <select
                value={filters.sort}
                onChange={(e) => updateParams({ sort: e.target.value })}
                aria-label="Trier les produits"
                className="min-h-[40px] rounded-full border border-black/[0.08] bg-offwhite px-3 text-sm font-medium text-charcoal focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 dark:border-white/10"
              >
                {SORT_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
            <div className="hidden sm:flex items-center gap-1 rounded-xl border border-black/[0.06] bg-offwhite p-1">
              <button type="button" onClick={() => setView('grid')} aria-label="Vue en grille" aria-pressed={view === 'grid'} className={cn('rounded-lg p-2', view === 'grid' ? 'bg-brand-50 text-brand-600' : 'text-charcoal/40')}>
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setView('list')} aria-label="Vue en liste" aria-pressed={view === 'list'} className={cn('rounded-lg p-2', view === 'list' ? 'bg-brand-50 text-brand-600' : 'text-charcoal/40')}>
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Filtres actifs */}
        {activeTags.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {activeTags.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => updateParams({ [t.key]: '' })}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100"
                aria-label={`Retirer le filtre ${t.label}`}
              >
                {t.label} <X className="h-3 w-3" />
              </button>
            ))}
            <button type="button" onClick={resetAll} className="text-xs font-semibold text-charcoal/50 underline hover:text-charcoal">Tout effacer</button>
          </div>
        )}

        <div className="flex gap-8">
          {/* Filtres desktop */}
          <aside className="hidden lg:block w-64 shrink-0">
            <div className="sticky top-24 rounded-2xl border border-black/[0.06] bg-offwhite p-5 dark:border-white/10">
              <FilterGroups filters={filters} provinces={provinces} onChange={updateParams} />
              {anyFilter && (
                <button type="button" onClick={resetAll} className="mt-6 w-full rounded-lg py-2 text-sm font-medium text-charcoal/60 hover:bg-black/5">
                  Réinitialiser
                </button>
              )}
            </div>
          </aside>

          {/* Résultats */}
          <div className="min-w-0 flex-1">
            {loading ? (
              <MarketplaceSkeleton list={view === 'list'} />
            ) : error ? (
              <ErrorState title="Impossible de charger les produits" message="Vérifiez votre connexion puis réessayez." onRetry={() => void load(false)} />
            ) : results.length === 0 ? (
              <EmptyMarketplace hasFilters={anyFilter} onReset={resetAll} />
            ) : (
              <div className={cn(
                view === 'grid'
                  ? 'grid grid-cols-1 min-[480px]:grid-cols-2 xl:grid-cols-3 min-[1700px]:grid-cols-4 gap-4 sm:gap-5'
                  : 'grid grid-cols-1 gap-3',
              )}>
                {results.map((product) => (
                  <ProductCard key={product.id} product={product} view={view} favorite={{ active: favorites.has(product.id), busy: favorites.busy.has(product.id), onToggle: () => void favorites.toggle(product.id) }} />
                ))}
              </div>
            )}
            {!loading && !error && hasMore && (
              <div className="mt-6 flex justify-center">
                <button type="button" disabled={loadingMore} onClick={() => void load(true)} className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-brand-300 bg-white px-6 text-sm font-semibold text-brand-700 hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-60">
                  {loadingMore ? 'Chargement…' : 'Voir plus de produits'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <FilterSheet
        open={sheetOpen}
        filters={filters}
        provinces={provinces}
        resultCount={total ?? results.length}
        onChange={updateParams}
        onClose={() => setSheetOpen(false)}
        onReset={resetAll}
      />

      <Footer />
    </div>
  );
}
