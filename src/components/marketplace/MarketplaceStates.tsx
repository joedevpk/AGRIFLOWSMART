import { Link } from 'react-router-dom';
import { AlertTriangle, PackageSearch, SearchX, UserX } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { buttonStyles } from '@/components/ui/button-styles';
import { cn } from '@/lib/utils';

/* ---------------------------- Skeletons ---------------------------- */

/** Même géométrie que ProductCard : image 3:2 + corps + 2 CTA. */
export function ProductCardSkeleton({ list = false }: { list?: boolean }) {
  return (
    <div className={cn('overflow-hidden rounded-2xl border border-black/[0.06] bg-offwhite', list && 'flex')} aria-hidden="true">
      <Skeleton className={cn('rounded-none', list ? 'w-36 sm:w-56 self-stretch' : 'aspect-[3/2] w-full')} />
      <div className="flex-1 space-y-3 p-4">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-7 w-1/2" />
        <div className="flex gap-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
        <Skeleton className="h-4 w-1/3" />
        <div className="flex gap-2 pt-2">
          <Skeleton className="h-10 flex-1 rounded-lg" />
          <Skeleton className="h-10 w-28 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export function MarketplaceSkeleton({ count = 6, list = false }: { count?: number; list?: boolean }) {
  return (
    <div
      role="status"
      aria-label="Chargement des produits"
      className={list ? 'space-y-3' : 'grid grid-cols-1 min-[480px]:grid-cols-2 xl:grid-cols-3 gap-4'}
    >
      {Array.from({ length: count }).map((_, i) => <ProductCardSkeleton key={i} list={list} />)}
    </div>
  );
}

export function ProductSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12" role="status" aria-label="Chargement de la fiche produit">
      <div className="space-y-3">
        <Skeleton className="aspect-[4/3] w-full rounded-3xl" />
        <div className="flex gap-2.5">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-16 rounded-xl" />)}
        </div>
      </div>
      <div className="space-y-4">
        <Skeleton className="h-6 w-28 rounded-full" />
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-9 w-40" />
        <div className="grid grid-cols-2 gap-3 pt-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
      </div>
    </div>
  );
}

export function ProducerSkeleton() {
  return (
    <div className="space-y-8" role="status" aria-label="Chargement du profil producteur">
      <div className="overflow-hidden rounded-3xl border border-black/[0.06] bg-offwhite">
        <Skeleton className="h-24 sm:h-28 w-full rounded-none" />
        <div className="px-5 sm:px-8 pb-8 -mt-10 sm:-mt-12">
          <div className="flex items-end gap-5">
            <Skeleton className="h-20 w-20 rounded-full ring-4 ring-offwhite" />
            <div className="flex-1 space-y-2 pb-1">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
          </div>
          <Skeleton className="mt-6 h-3 w-full max-w-xl" />
          <Skeleton className="mt-2 h-3 w-2/3 max-w-md" />
        </div>
      </div>
      <div className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => <ProductCardSkeleton key={i} />)}
      </div>
    </div>
  );
}

/* ------------------------- Empty & erreurs ------------------------- */

interface EmptyMarketplaceProps {
  /** true : des filtres/recherche sont actifs ; false : la marketplace est réellement vide. */
  hasFilters: boolean;
  onReset?: () => void;
}

export function EmptyMarketplace({ hasFilters, onReset }: EmptyMarketplaceProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-black/[0.1] bg-offwhite px-6 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        {hasFilters ? <SearchX className="h-8 w-8" /> : <PackageSearch className="h-8 w-8" />}
      </div>
      <h3 className="text-lg font-bold text-charcoal">
        {hasFilters ? 'Aucune production ne correspond' : 'Aucune production publiée pour le moment'}
      </h3>
      <p className="mt-1.5 max-w-sm text-sm text-charcoal/55">
        {hasFilters
          ? 'Essayez un autre produit, une autre zone ou retirez certains filtres.'
          : 'Les producteurs et coopératives publient leurs productions ici. Revenez bientôt ou publiez la vôtre.'}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {hasFilters && onReset && (
          <button type="button" onClick={onReset} className={buttonStyles({ variant: 'primary' })}>Réinitialiser les filtres</button>
        )}
        {!hasFilters && <Link to="/register" className={buttonStyles({ variant: 'primary' })}>Publier une production</Link>}
        <Link to="/buyers" className={buttonStyles({ variant: 'outline' })}>Poster une demande d'achat</Link>
      </div>
    </div>
  );
}

interface StateErrorProps {
  /** Ressource introuvable (404) plutôt qu'une panne de chargement. */
  notFound?: boolean;
  message?: string;
  onRetry?: () => void;
}

export function ProductError({ notFound, message, onRetry }: StateErrorProps) {
  return (
    <ErrorPanel
      icon={notFound ? <PackageSearch className="h-8 w-8" /> : <AlertTriangle className="h-8 w-8" />}
      title={notFound ? 'Offre introuvable' : 'Impossible de charger cette offre'}
      message={message ?? (notFound ? 'Cette production n\'existe pas ou n\'est plus disponible.' : 'Vérifiez votre connexion puis réessayez.')}
      onRetry={notFound ? undefined : onRetry}
      backTo="/marketplace"
      backLabel="Retour à la marketplace"
    />
  );
}

export function ProducerError({ notFound, message, onRetry }: StateErrorProps) {
  return (
    <ErrorPanel
      icon={notFound ? <UserX className="h-8 w-8" /> : <AlertTriangle className="h-8 w-8" />}
      title={notFound ? 'Profil introuvable' : 'Impossible de charger ce profil'}
      message={message ?? (notFound ? 'Ce producteur n\'existe pas ou a quitté la plateforme.' : 'Vérifiez votre connexion puis réessayez.')}
      onRetry={notFound ? undefined : onRetry}
      backTo="/producers"
      backLabel="Voir les producteurs"
    />
  );
}

function ErrorPanel({ icon, title, message, onRetry, backTo, backLabel }: {
  icon: React.ReactNode; title: string; message: string; onRetry?: () => void; backTo: string; backLabel: string;
}) {
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-50 text-accent-600">{icon}</div>
      <h1 className="text-xl font-bold text-charcoal">{title}</h1>
      <p className="mt-1.5 text-sm text-charcoal/55">{message}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {onRetry && <button type="button" onClick={onRetry} className={buttonStyles({ variant: 'primary' })}>Réessayer</button>}
        <Link to={backTo} className={buttonStyles({ variant: 'outline' })}>{backLabel}</Link>
      </div>
    </div>
  );
}
