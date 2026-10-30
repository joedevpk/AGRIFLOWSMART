import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, PackageSearch } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MarketplaceSkeleton } from '@/components/marketplace/MarketplaceStates';
import { ProductCard } from '@/components/ui/ProductCard';
import { Button } from '@/components/ui';
import { ErrorState } from '@/components/ui/States';
import { fetchMarketplacePage } from '@/lib/marketplace-query';
import { parseFilters } from '@/lib/marketplace';
import { reportError } from '@/lib/logger';
import type { ProductWithProfile } from '@/types';

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: ProductWithProfile[] };
const COUNT = 6;

/**
 * Offres RÉCENTES de la marketplace, lues dans la base avec la même requête et la même carte que la page Marketplace.
 * Aucune donnée d'exemple : sans offre publiée, un état vide explicite est affiché.
 */
export function LatestOffers() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const load = useCallback(async () => {
    setState({ status: 'loading' });
    const res = await fetchMarketplacePage(parseFilters(new URLSearchParams()), 1, COUNT, false);
    if (res.error) { reportError('LatestOffers.load', res.error); setState({ status: 'error' }); return; }
    setState({ status: 'ready', items: res.data as ProductWithProfile[] });
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <section aria-labelledby="offres-recentes" className="py-14 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="offres-recentes" className="text-2xl font-bold tracking-tight text-charcoal sm:text-3xl dark:text-cream">Offres récentes</h2>
            <p className="mt-1 text-sm text-charcoal/60 dark:text-cream/60">Les dernières productions publiées par les producteurs.</p>
          </div>
          <Link to="/marketplace" className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-300">
            Voir toute la marketplace <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        {state.status === 'loading' && <MarketplaceSkeleton count={3} />}
        {state.status === 'error' && <ErrorState message="Les offres n'ont pas pu être chargées." onRetry={() => void load()} />}
        {state.status === 'ready' && state.items.length === 0 && (
          <div className="flex flex-col items-center rounded-3xl border border-dashed border-black/[0.1] bg-offwhite px-6 py-12 text-center dark:border-white/10 dark:bg-charcoal/60">
            <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><PackageSearch className="h-7 w-7" aria-hidden="true" /></span>
            <h3 className="text-lg font-bold text-charcoal dark:text-cream">Aucune offre publiée pour le moment</h3>
            <p className="mt-1 max-w-md text-sm text-charcoal/60 dark:text-cream/60">Les nouvelles offres apparaîtront ici dès leur publication. Vous êtes producteur ? Publiez la première.</p>
            <Link to="/register" className="mt-5"><Button>Créer un compte producteur</Button></Link>
          </div>
        )}
        {state.status === 'ready' && state.items.length > 0 && (
          /* Téléphone : défilement horizontal par cartes (la page ne s'allonge pas, la carte suivante reste visible) ; tablette et plus : grille. */
          <ul
            aria-label="Offres récentes"
            tabIndex={0}
            className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3"
          >
            {state.items.map((p) => <li key={p.id} className="w-[82%] max-w-[22rem] shrink-0 snap-start sm:w-auto sm:max-w-none sm:min-w-0"><ProductCard product={p} /></li>)}
          </ul>
        )}
      </div>
    </section>
  );
}
