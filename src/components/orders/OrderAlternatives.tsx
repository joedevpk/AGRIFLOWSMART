import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package, MapPin, BadgeCheck, Search } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button-styles';
import { Skeleton } from '@/components/ui/Skeleton';
import { useLanguage } from '@/contexts/language-context';
import { fetchOrderAlternatives, type AlternativesResult } from '@/services/confirmationService';
import { formatPrice, formatQuantity, UNIT_LABELS } from '@/lib/constants';
import { getProductImage } from '@/lib/image-config';
import type { OrderAlternative } from '@/types';

/**
 * Alternatives proposées à l'acheteur quand le producteur n'a pas confirmé / a refusé.
 * Uniquement des produits réellement présents en base (calcul serveur, RPC `order_alternatives`) ;
 * aucun producteur n'est choisi automatiquement.
 */
export function OrderAlternatives({ orderId, onLoaded }: { orderId: string; onLoaded?: (count: number) => void }) {
  const { t } = useLanguage();
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: AlternativesResult }>({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    const result = await fetchOrderAlternatives(orderId);
    if (result.ok) { setState({ status: 'ready', data: result.data }); onLoaded?.(result.data.alternatives.length); }
    else setState({ status: 'error', message: result.message });
  }, [orderId, onLoaded]);

  useEffect(() => { void load(); }, [load]);

  if (state.status === 'loading') {
    return <div aria-busy="true" aria-label={t('alt.loading')} className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>;
  }
  if (state.status === 'error') {
    return (
      <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-700/50 dark:bg-rose-900/20 dark:text-rose-100">
        {t(state.message)}{' '}
        <button type="button" onClick={() => void load()} className="font-semibold underline">OK</button>
      </div>
    );
  }
  if (!state.data.eligible) return null;
  const items = state.data.alternatives;

  return (
    <section id="alternatives" aria-labelledby="alternatives-title" className="scroll-mt-24">
      <h3 id="alternatives-title" className="text-base font-bold text-charcoal">{t('alt.title')}</h3>
      {items.length === 0 ? (
        <p className="mt-2 flex items-start gap-2 rounded-xl border border-slate-300 bg-slate-100 p-4 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
          <Search className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {t('alt.none')}
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-charcoal/70">{t('alt.found')} {t('alt.noAuto')}</p>
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {items.map((a) => <AlternativeCard key={a.product_id} item={a} />)}
          </ul>
        </>
      )}
    </section>
  );
}

function AlternativeCard({ item }: { item: OrderAlternative }) {
  const { t } = useLanguage();
  const unit = UNIT_LABELS[item.unit] || item.unit;
  return (
    <li className="flex gap-3 rounded-xl border border-black/[0.08] bg-white p-3 dark:border-white/10 dark:bg-white/[0.04]">
      <img src={item.image || getProductImage(item.name)} alt="" loading="lazy" className="h-20 w-20 shrink-0 rounded-lg object-cover" />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate font-semibold text-charcoal">{item.name}</p>
        <p className="text-sm font-bold text-brand-700">{formatPrice(item.price, item.currency)} <span className="font-medium text-charcoal/60">/ {unit}</span></p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-charcoal/70">
          <span className="inline-flex items-center gap-1"><Package className="h-3 w-3" aria-hidden="true" />{item.covers_quantity ? t('alt.fullQty') : t('alt.partialQty', { qty: formatQuantity(item.quantity, item.unit) })}</span>
          {(item.city || item.province) && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden="true" />{item.city || item.province}</span>}
        </p>
        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-charcoal/70">
          {item.producer_name ?? '—'}
          {item.is_verified && <BadgeCheck className="h-3.5 w-3.5 text-brand-600" aria-label="Profil vérifié" />}
          <span className="ml-1 rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-800">{item.same_product ? t('alt.sameProduct') : t('alt.similar')}</span>
        </p>
        <Link to={`/marketplace/${item.product_id}`} className={buttonStyles({ variant: 'outline', size: 'sm', className: 'mt-2 self-start' })}>{t('alt.viewOffer')}</Link>
      </div>
    </li>
  );
}
