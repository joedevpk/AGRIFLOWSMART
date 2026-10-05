import type { ReactNode } from 'react';
import type { CartTotals } from '@/types';
import { formatPrice } from '@/lib/constants';
import { estimateDelivery } from '@/services/deliveryService';

/** Lignes de totaux : sous-total, livraison (jamais un montant inventé), total. */
export function PriceSummary({ totals, footer }: { totals: CartTotals; footer?: ReactNode }) {
  const currency = totals.currency ?? 'USD';
  const delivery = estimateDelivery();
  return (
    <dl className="space-y-2.5 text-sm">
      <div className="flex items-center justify-between">
        <dt className="text-charcoal/60">Sous-total ({totals.itemCount} produit{totals.itemCount > 1 ? 's' : ''})</dt>
        <dd className="font-semibold tabular-nums text-charcoal">{formatPrice(totals.subtotal, currency)}</dd>
      </div>
      <div className="flex items-center justify-between gap-4">
        <dt className="text-charcoal/60">Livraison</dt>
        <dd className="text-right font-medium text-charcoal/70">{totals.deliveryFee === null ? delivery.label : formatPrice(totals.deliveryFee, currency)}</dd>
      </div>
      <div className="flex items-center justify-between border-t border-black/[0.08] pt-3">
        <dt className="text-base font-bold text-charcoal">Total</dt>
        <dd className="text-xl font-extrabold tabular-nums text-brand-700">{formatPrice(totals.total, currency)}</dd>
      </div>
      {footer}
    </dl>
  );
}
