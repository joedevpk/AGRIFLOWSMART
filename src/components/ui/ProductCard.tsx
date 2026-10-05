import { Link } from 'react-router-dom';
import { MapPin, Package, BadgeCheck, Sprout, Heart, PauseCircle } from 'lucide-react';
import { useLanguage } from '@/contexts/language-context';
import { isProducerAccepting } from '@/lib/order-confirmation';
import { Avatar } from '@/components/ui/Avatar';
import { SmartImage } from '@/components/ui/SmartImage';
import { buttonStyles } from '@/components/ui/button-styles';
import { ContactProducerButton } from '@/components/marketplace/ContactProducer';
import { useAuth } from '@/contexts/auth-context';
import type { ProductWithProfile } from '@/types';
import { formatPrice, formatQuantity, UNIT_LABELS } from '@/lib/constants';
import { getProductImage } from '@/lib/image-config';
import { AVAILABILITY_BADGE_CLASSES, categoryName, getAvailability, productAlt, productLocation } from '@/lib/marketplace';
import { cn } from '@/lib/utils';

interface ProductCardProps {
  product: ProductWithProfile;
  view?: 'grid' | 'list';
  showProducer?: boolean;
  /** Aperçu (publication) : mêmes visuels, actions inertes. */
  preview?: boolean;
  /** Bouton favori (état fourni par la page, un seul chargement pour toute la liste). */
  favorite?: { active: boolean; busy?: boolean; onToggle: () => void };
}

/**
 * Carte produit marketplace : image dominante (~50 %), badge de disponibilité,
 * prix en vert, producteur, CTA « Commander » + « Contacter ».
 * Pas de <a> englobant : les boutons ne sont jamais imbriqués dans un lien.
 */
export function ProductCard({ product, view = 'grid', showProducer = true, preview = false, favorite }: ProductCardProps) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const producer = product.profiles;
  const producerUnavailable = !isProducerAccepting(producer);
  const producerName = producer?.full_name ?? 'Producteur';
  const availability = getAvailability(product);
  const isOwn = !!user && product.user_id === user.id;
  // Producteur indisponible : l'offre reste visible, mais on ne promet pas un traitement immédiat (CTA « Voir l'offre »).
  const canOrder = product.status === 'available' && !isOwn && !producerUnavailable;
  const href = `/marketplace/${product.id}`;
  const isList = view === 'list';

  const imageSrc = product.images?.[0] || (product.name ? getProductImage(product.name) : null);
  const unitLabel = UNIT_LABELS[product.unit] || product.unit;
  const orderClasses = buttonStyles({ variant: 'primary', size: 'md', fullWidth: true, className: 'font-semibold' });
  const contactClasses = buttonStyles({ variant: 'harvest', size: 'md', className: 'font-semibold' });

  const media = (
    <div className={cn('relative shrink-0 overflow-hidden bg-sage/60', isList ? 'w-36 sm:w-56' : 'aspect-[3/2] w-full')}>
      {imageSrc ? (
        <SmartImage
          src={imageSrc}
          fallbackSrc={product.name ? getProductImage(product.name) : undefined}
          alt={productAlt(product)}
          className="transition-transform duration-500 group-hover:scale-105"
          sizes={isList ? '224px' : undefined}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-brand-600/30"><Sprout className="h-12 w-12" /></div>
      )}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm', AVAILABILITY_BADGE_CLASSES[availability.tone])}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {availability.label}
        </span>
        {product.price_negotiable && (
          <span className="rounded-full bg-offwhite/95 px-2.5 py-1 text-xs font-medium text-charcoal/70 shadow-sm">Négociable</span>
        )}
      </div>
      {favorite && !preview && (
        <button
          type="button"
          onClick={favorite.onToggle}
          disabled={favorite.busy}
          aria-pressed={favorite.active}
          aria-label={favorite.active ? `Retirer ${product.name} des favoris` : `Ajouter ${product.name} aux favoris`}
          className="absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center rounded-full bg-offwhite/95 text-charcoal/70 shadow-sm transition-colors hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-60"
        >
          <Heart className={cn('h-5 w-5', favorite.active && 'fill-rose-500 text-rose-500')} aria-hidden="true" />
        </button>
      )}
    </div>
  );

  return (
    <article className={cn(
      'group overflow-hidden rounded-2xl border border-black/[0.06] bg-offwhite shadow-card transition-all duration-300',
      !preview && 'hover:-translate-y-0.5 hover:shadow-card-hover hover:border-brand-200',
      isList ? 'flex' : 'flex h-full flex-col',
    )}>
      {preview ? media : <Link to={href} aria-label={`Voir l'offre : ${product.name}`} tabIndex={-1} className={cn('block', isList && 'shrink-0')}>{media}</Link>}

      <div className="flex min-w-0 flex-1 flex-col p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-600/80">
          {product.category ? categoryName(product.category) : 'Produit agricole'}
        </p>
        <h3 className="mt-0.5 text-lg font-bold leading-snug text-charcoal">
          {preview ? product.name : <Link to={href} className="hover:text-brand-700 focus-visible:outline-none focus-visible:underline">{product.name}</Link>}
        </h3>

        <p className="mt-1 text-2xl font-extrabold leading-none text-brand-700 tabular-nums">
          {product.price > 0 ? formatPrice(product.price, product.currency) : <span className="text-base font-semibold text-charcoal/40">Prix à définir</span>}
          {product.price > 0 && <span className="text-sm font-medium text-charcoal/50"> / {unitLabel}</span>}
        </p>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-charcoal/60">
          <span className="flex items-center gap-1.5">
            <Package className="h-4 w-4 text-brand-600/70" />
            {product.quantity > 0 ? `${formatQuantity(product.quantity, product.unit)} dispo.` : 'Quantité à préciser'}
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-brand-600/70" /> {product.city || product.province ? productLocation(product) : 'Localisation à préciser'}
          </span>
        </div>

        {showProducer && (
          <div className="mt-3 flex items-center gap-2 text-sm text-charcoal/70">
            <Avatar name={producerName} src={producer?.avatar_url} size="xs" className="ring-0" />
            {preview || !product.user_id ? (
              <span className="truncate">{producerName}</span>
            ) : (
              <Link to={`/producer/${product.user_id}`} className="truncate hover:text-brand-700 hover:underline">{producerName}</Link>
            )}
            {producer?.is_verified && <BadgeCheck className="h-4 w-4 shrink-0 text-brand-500" aria-label="Profil vérifié" />}
          </div>
        )}

        {producerUnavailable && product.status === 'available' && !isOwn && (
          <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-200" role="note">
            <PauseCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {t('producer.unavailableNote')}
          </p>
        )}

        <div className={cn('mt-auto flex gap-2 pt-4', isList && 'max-w-sm')}>
          {preview ? (
            <>
              <span className={orderClasses} aria-hidden="true">Commander</span>
              <span className={contactClasses} aria-hidden="true">Contacter</span>
            </>
          ) : (
            <>
              {canOrder ? (
                <Link to={`${href}?commander=1`} className={orderClasses}>Commander</Link>
              ) : (
                <Link to={href} className={buttonStyles({ variant: 'secondary', size: 'md', fullWidth: true, className: 'font-semibold' })}>
                  {isOwn ? 'Voir mon offre' : 'Voir l\'offre'}
                </Link>
              )}
              {!isOwn && (
                <ContactProducerButton
                  producerId={product.user_id}
                  producerName={producerName}
                  productId={product.id}
                  productName={product.name}
                  className="font-semibold"
                />
              )}
            </>
          )}
        </div>
      </div>
    </article>
  );
}
