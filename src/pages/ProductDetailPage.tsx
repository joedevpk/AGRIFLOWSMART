import { PRODUCT_DETAIL_WITH_PRODUCER } from '@/lib/columns';
import { PauseCircle } from 'lucide-react';
import { AvailabilityBadge } from '@/components/availability/AvailabilityBadge';
import { useLanguage } from '@/contexts/language-context';
import { isProducerAccepting, unavailableUntil, formatDeadline } from '@/lib/order-confirmation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSeo } from '@/hooks/useSeo';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft, MapPin, Package, CalendarDays, ShoppingCart,
  BadgeCheck, Truck, Tag, ChevronRight, Check,
} from 'lucide-react';
import { Header, Footer } from '@/components/layout/Header';
import { Button, Avatar, ProductGallery } from '@/components/ui';
import { ProductCard } from '@/components/ui/ProductCard';
import { QuantityStepper } from '@/components/orders/QuantityStepper';
import { ProductError, ProductSkeleton } from '@/components/marketplace/MarketplaceStates';
import { ContactProducerButton } from '@/components/marketplace/ContactProducer';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/auth-context';
import { useCart } from '@/contexts/cart-context';
import { FavoriteButton } from '@/components/ui/FavoriteButton';
import type { LiveProduct, ProductWithProfile } from '@/types';
import { formatPrice, formatQuantity, formatDate, UNIT_LABELS } from '@/lib/constants';
import { getProductImage } from '@/lib/image-config';
import { AVAILABILITY_BADGE_CLASSES, categoryName, getAvailability, productAlt, productLocation } from '@/lib/marketplace';
import { toast } from '@/components/ui/toast-store';
import { cn } from '@/lib/utils';

const PRODUCT_SELECT = PRODUCT_DETAIL_WITH_PRODUCER;

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [product, setProduct] = useState<ProductWithProfile | null>(null);
  useSeo({
    title: product ? `${product.name} | AgriFlow RDC` : 'Produit | AgriFlow RDC',
    description: product ? (product.description?.trim().slice(0, 155) || `${product.name} disponible auprès de ${product.profiles?.full_name ?? 'un producteur'} sur AgriFlow RDC.`) : undefined,
    image: product ? (product.images?.[0] || getProductImage(product.name)) : undefined,
    imageAlt: product?.name,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { addToCart, quantityInCart } = useCart();
  const { t, language } = useLanguage();
  const [quantity, setQuantity] = useState(1);
  const focusOrder = searchParams.get('commander') === '1';
  const [related, setRelated] = useState<{ similar: ProductWithProfile[]; fromProducer: ProductWithProfile[] }>({ similar: [], fromProducer: [] });
  const orderRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase.from('products').select(PRODUCT_SELECT).eq('id', id).maybeSingle();
    if (error) {
      setLoadError(error.message);
      setProduct(null);
    } else {
      setLoadError(null);
      setProduct(data as ProductWithProfile | null);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Produits similaires (même catégorie) et autres productions du même producteur.
  // Requêtes Supabase réelles, jamais de données inventées ; sections masquées si rien n'est trouvé.
  useEffect(() => {
    if (!product) { setRelated({ similar: [], fromProducer: [] }); return; }
    let cancelled = false;
    Promise.all([
      supabase.from('products').select(PRODUCT_SELECT).eq('category', product.category).eq('status', 'available').neq('id', product.id).order('created_at', { ascending: false }).limit(8),
      supabase.from('products').select(PRODUCT_SELECT).eq('user_id', product.user_id).eq('status', 'available').neq('id', product.id).order('created_at', { ascending: false }).limit(8),
    ]).then(([similarRes, producerRes]) => {
      if (cancelled) return;
      setRelated({
        similar: (similarRes.data as ProductWithProfile[] | null) ?? [],
        fromProducer: (producerRes.data as ProductWithProfile[] | null) ?? [],
      });
    });
    return () => { cancelled = true; };
  }, [product]);

  // Lien « Commander » depuis une carte produit : amène directement sur le bloc d'achat.
  useEffect(() => {
    if (focusOrder && product) orderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusOrder, product]);

  if (loading) {
    return (
      <div className="min-h-screen bg-cream dark:bg-charcoal transition-colors">
        <Header />
        <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8"><ProductSkeleton /></main>
      </div>
    );
  }
  if (loadError || !product) {
    return (
      <div className="min-h-screen bg-cream dark:bg-charcoal transition-colors">
        <Header />
        <ProductError notFound={!loadError} onRetry={load} />
        <Footer />
      </div>
    );
  }

  const producerName = product.profiles?.full_name ?? 'Producteur';
  const producer = product.profiles;
  const fallbackImage = getProductImage(product.name);
  const images = product.images?.length ? product.images : [fallbackImage];
  const availability = getAvailability(product);
  const unitLabel = UNIT_LABELS[product.unit] || product.unit;
  const isOwn = product.user_id === user?.id;
  const canOrder = !isOwn && product.status === 'available';
  // Disponibilité du PRODUCTEUR, distincte du stock du produit : le serveur refuse de toute façon la commande.
  const producerUnavailable = canOrder && !isProducerAccepting(product.profiles);
  const producerBackOn = unavailableUntil(product.profiles);
  const maxQty = Math.max(1, Math.floor(product.quantity));
  const inCart = quantityInCart(product.id);
  const total = product.price * quantity;

  const toLiveProduct = (): LiveProduct => ({
    id: product.id,
    user_id: product.user_id,
    name: product.name,
    image: product.images?.[0] ?? null,
    unit: product.unit,
    price: product.price,
    currency: product.currency,
    quantity: product.quantity,
    status: product.status,
    availability_date: product.availability_date ?? null,
    producer_name: producerName,
  });

  // Ajout au panier local. Le prix et le stock affichés ici ne font jamais foi :
  // ils sont relus au moment du panier puis revalidés par le serveur à la commande.
  const addCurrentToCart = (): boolean => {
    const result = addToCart(toLiveProduct(), quantity);
    if (!result.ok) {
      toast('error', result.message);
      return false;
    }
    toast('success', result.clamped ? `Quantité limitée au stock disponible (${result.quantity} ${unitLabel}).` : 'Produit ajouté au panier.');
    return true;
  };

  const buyNow = () => {
    if (addCurrentToCart() || inCart > 0) navigate('/cart');
  };

  const orderControls = (
    <>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-sm text-charcoal/50">Quantité ({unitLabel})</p>
          <p className="text-2xl font-extrabold text-brand-700 tabular-nums">{formatPrice(total, product.currency)}</p>
        </div>
        <QuantityStepper value={quantity} max={maxQty} onChange={setQuantity} label={`Quantité de ${product.name} en ${unitLabel}`} />
      </div>
      {inCart > 0 && (
        <p className="mb-3 flex items-center gap-1.5 text-sm text-brand-700" role="status">
          <Check className="h-4 w-4" aria-hidden="true" /> Déjà dans votre panier : {formatQuantity(inCart, product.unit)}.{' '}
          <Link to="/cart" className="font-semibold underline">Voir le panier</Link>
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" size="lg" className="flex-1" onClick={() => addCurrentToCart()}>
          <ShoppingCart className="h-5 w-5" aria-hidden="true" /> Ajouter au panier
        </Button>
        <Button size="lg" className="flex-1" onClick={buyNow}>Commander maintenant</Button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-cream dark:bg-charcoal transition-colors">
      <Header />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 pb-40 lg:py-8 lg:pb-12">
        {/* Fil d'Ariane */}
        <nav aria-label="Fil d'Ariane" className="mb-5 flex items-center gap-1.5 text-sm text-charcoal/50">
          <Link to="/marketplace" className="inline-flex items-center gap-1.5 hover:text-charcoal"><ArrowLeft className="h-4 w-4" /> Produits agricoles</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="truncate text-charcoal/80">{product.name}</span>
        </nav>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
          {/* Colonne gauche : galerie + producteur */}
          <div className="space-y-5 lg:sticky lg:top-24 lg:self-start">
            <ProductGallery images={images} alt={productAlt(product)} fallbackSrc={fallbackImage} />
          </div>

          {/* Colonne droite : infos */}
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold', AVAILABILITY_BADGE_CLASSES[availability.tone], availability.tone === 'reserved' && 'border border-black/10')}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" /> {availability.label}
              </span>
              {product.price_negotiable && <span className="inline-flex items-center gap-1 rounded-full bg-accent-100 px-3 py-1 text-xs font-semibold text-accent-700"><Tag className="h-3 w-3" /> Prix négociable</span>}
              <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">{categoryName(product.category)}</span>
            </div>

            <h1 className="text-3xl font-extrabold tracking-tight text-charcoal sm:text-4xl">{product.name}</h1>
            {product.variety && <p className="mt-1.5 text-charcoal/55">Variété : {product.variety}</p>}

            <p className="mt-4 text-4xl font-extrabold text-brand-700 tabular-nums">
              {formatPrice(product.price, product.currency)}
              <span className="text-lg font-medium text-charcoal/50"> / {unitLabel}</span>
            </p>

            <dl className="mt-6 grid grid-cols-2 gap-3">
              {[
                { icon: Package, label: 'Quantité disponible', value: formatQuantity(product.quantity, product.unit) },
                { icon: MapPin, label: 'Localisation', value: productLocation(product) },
                { icon: CalendarDays, label: 'Disponibilité', value: product.availability_date && availability.tone === 'soon' ? formatDate(product.availability_date) : availability.label },
                { icon: CalendarDays, label: 'Publié le', value: formatDate(product.created_at) },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="rounded-xl border border-black/[0.06] bg-offwhite p-4">
                  <Icon className="mb-2 h-5 w-5 text-brand-600" aria-hidden="true" />
                  <dt className="text-xs text-charcoal/50">{label}</dt>
                  <dd className="mt-0.5 font-semibold text-charcoal">{value}</dd>
                </div>
              ))}
            </dl>

            {/* Commande */}
            <div ref={orderRef} className="mt-6 scroll-mt-24">
              {isOwn && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/[0.06] bg-offwhite px-4 py-3 text-sm text-charcoal/60">
                  <span>C'est votre propre production.</span>
                  <Link to={`/producer/products/${product.id}/edit`} className="font-semibold text-brand-700 hover:underline">Modifier cette production</Link>
                </div>
              )}

              {!isOwn && !canOrder && (
                <div className="rounded-xl border border-black/[0.06] bg-offwhite px-4 py-3 text-sm text-charcoal/60">
                  <div className="flex items-center justify-between gap-3">
                    <p>Cette production n'est plus disponible à la commande. Vous pouvez contacter le producteur pour connaître la prochaine récolte.</p>
                    <FavoriteButton productId={product.id} productName={product.name} variant="inline" />
                  </div>
                </div>
              )}

              {producerUnavailable && (
                <div role="status" className="rounded-2xl border border-slate-300 bg-slate-100 p-5 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">{t('product.inStock')}</span>
                    <AvailabilityBadge accepting={false} />
                  </div>
                  <p className="mt-3 flex items-start gap-2 text-sm font-medium"><PauseCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{t('producer.noImmediate')}{producerBackOn ? ` ${t('producer.unavailableUntil', { date: formatDeadline(producerBackOn, language) })}.` : ''}</p>
                  <div className="mt-3 flex gap-3">
                    <ContactProducerButton producerId={product.user_id} producerName={producerName} productId={product.id} productName={product.name} size="lg" className="flex-1" />
                    <FavoriteButton productId={product.id} productName={product.name} variant="inline" />
                  </div>
                </div>
              )}

              {canOrder && !producerUnavailable && (
                <div className="rounded-2xl border border-brand-200 bg-brand-50/50 p-5">
                  {orderControls}
                  <div className="mt-3 flex gap-3">
                    <ContactProducerButton producerId={product.user_id} producerName={producerName} productId={product.id} productName={product.name} size="lg" className="flex-1" />
                    <FavoriteButton productId={product.id} productName={product.name} variant="inline" />
                  </div>
                </div>
              )}
            </div>

            {product.description && (
              <section className="mt-8">
                <h2 className="mb-2 text-base font-bold text-charcoal">Description</h2>
                <p className="whitespace-pre-line text-sm leading-relaxed text-charcoal/70">{product.description}</p>
              </section>
            )}

            <div className="mt-6">
            <div className="rounded-2xl border border-black/[0.06] bg-offwhite p-4 sm:p-5">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-charcoal/40">Producteur</p>
                <div className="flex items-center gap-3">
                  <Avatar name={producerName} src={producer?.avatar_url} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate font-bold text-charcoal">{producerName}</p>
                      {producer?.is_verified && <BadgeCheck className="h-5 w-5 shrink-0 text-brand-500" aria-label="Profil vérifié" />}
                    </div>
                    <p className="flex items-center gap-1 text-sm text-charcoal/55">
                      <MapPin className="h-3.5 w-3.5" /> {producer?.city || producer?.province || 'RDC'}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Link to={`/producer/${product.user_id}`} className="inline-flex flex-1 items-center justify-center rounded-lg border border-brand-200 px-4 py-2.5 text-sm font-medium text-charcoal/80 hover:bg-cream">
                    Voir le profil
                  </Link>
                  <ContactProducerButton
                    producerId={product.user_id}
                    producerName={producerName}
                    productId={product.id}
                    productName={product.name}
                    className="flex-1"
                  />
                </div>
              </div>
            </div>

            <section className="mt-6 flex gap-3 rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white"><Truck className="h-5 w-5" /></div>
              <div>
                <h2 className="text-sm font-bold text-charcoal">Livraison</h2>
                <p className="mt-0.5 text-sm text-charcoal/65">La livraison est organisée avec le producteur. Les modalités et la date estimée sont confirmées après la commande.</p>
              </div>
            </section>
          </div>
        </div>

        {/* Autres productions du même producteur */}
        {related.fromProducer.length > 0 && (
          <section className="mt-14">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-charcoal">Autres productions de {producerName}</h2>
              <Link to={`/producer/${product.user_id}`} className="text-sm font-semibold text-brand-700 hover:underline">Voir le profil</Link>
            </div>
            <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
              {related.fromProducer.slice(0, 4).map((p) => (
                <div key={p.id} className="w-64 shrink-0 sm:w-auto"><ProductCard product={p} showProducer={false} /></div>
              ))}
            </div>
          </section>
        )}

        {/* Produits similaires (même catégorie) */}
        {related.similar.length > 0 && (
          <section className="mt-14">
            <h2 className="mb-4 text-lg font-bold text-charcoal">Produits similaires</h2>
            <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
              {related.similar.slice(0, 4).map((p) => (
                <div key={p.id} className="w-64 shrink-0 sm:w-auto"><ProductCard product={p} /></div>
              ))}
            </div>
          </section>
        )}
      </main>
      <Footer />

      {/* CTA sticky mobile (au-dessus de la bottom navigation) */}
      {!isOwn && (
        <div className="fixed inset-x-0 bottom-above-nav z-30 border-t border-black/[0.06] bg-offwhite/95 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur-sm lg:hidden">
          <div className="flex items-center gap-2">
            <div className="hidden min-w-0 flex-1 min-[420px]:block">
              <p className="truncate text-[11px] leading-tight text-charcoal/50">Prix / {unitLabel}</p>
              <p className="whitespace-nowrap text-base font-extrabold leading-tight text-brand-700 tabular-nums">{formatPrice(product.price, product.currency)}</p>
            </div>
            <ContactProducerButton producerId={product.user_id} producerName={producerName} productId={product.id} productName={product.name} className="min-h-[44px] flex-1 px-3 min-[420px]:flex-none" />
            {canOrder && !producerUnavailable && (
              <Button onClick={() => addCurrentToCart()} className="min-h-[44px] flex-1 px-4 min-[420px]:flex-none">
                <ShoppingCart className="h-4 w-4" aria-hidden="true" /> Ajouter
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
