import { Link } from 'react-router-dom';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { QuantityStepper } from './QuantityStepper';
import type { CartItem } from '@/types';
import { UNIT_LABELS, formatPrice, formatQuantity } from '@/lib/constants';
import { getProductImage } from '@/lib/image-config';
import { issueMessage } from '@/lib/cart';

interface CartLineRowProps {
  item: CartItem;
  onQuantityChange: (quantity: number) => void;
  onRemove: () => void;
}

export function CartLineRow({ item, onQuantityChange, onRemove }: CartLineRowProps) {
  const unitLabel = UNIT_LABELS[item.unit] || item.unit;
  const message = issueMessage(item);
  const canAdjust = item.issue === 'insufficient_stock' && item.available_quantity > 0;

  return (
    <li className="rounded-2xl border border-black/[0.06] bg-offwhite p-4 shadow-card sm:p-5">
      <div className="flex gap-4">
        <Link to={`/marketplace/${item.product_id}`} className="block h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-sage/60 sm:h-24 sm:w-24" tabIndex={-1} aria-hidden="true">
          <img src={item.image || getProductImage(item.name)} alt="" className="h-full w-full object-cover" loading="lazy" />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link to={`/marketplace/${item.product_id}`} className="block truncate font-semibold text-charcoal hover:text-brand-700 focus:outline-none focus-visible:underline">
                {item.name}
              </Link>
              {item.producer_name && <p className="truncate text-sm text-charcoal/55">{item.producer_name}</p>}
              <p className="mt-0.5 text-sm text-charcoal/60 tabular-nums">
                {formatPrice(item.unit_price, item.currency)} / {unitLabel}
              </p>
            </div>
            {!item.issue && <p className="shrink-0 text-lg font-extrabold tabular-nums text-brand-700">{formatPrice(item.subtotal, item.currency)}</p>}
          </div>

          {item.previous_price !== null && !item.issue && (
            <p className="mt-2 rounded-lg bg-accent-50 px-3 py-1.5 text-xs text-accent-700" role="status">
              Le prix a changé depuis l'ajout au panier : {formatPrice(item.previous_price, item.currency)} → {formatPrice(item.unit_price, item.currency)} / {unitLabel}.
            </p>
          )}

          {message && (
            <div role="alert" className="mt-3 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{message}</p>
                {item.issue === 'insufficient_stock' && (
                  <p className="mt-0.5 text-rose-700/80">
                    {item.available_quantity > 0 ? `Il reste ${formatQuantity(item.available_quantity, item.unit)} en stock (vous en avez demandé ${item.quantity}).` : 'Ce produit est épuisé.'}
                  </p>
                )}
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {canAdjust && (
                    <Button size="sm" variant="primary" onClick={() => onQuantityChange(item.available_quantity)}>
                      Ajuster à {item.available_quantity}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={onRemove}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" /> Retirer du panier
                  </Button>
                </div>
              </div>
            </div>
          )}

          {!item.issue && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <QuantityStepper value={item.quantity} max={item.available_quantity || item.quantity} onChange={onQuantityChange} label={`Quantité de ${item.name} en ${unitLabel}`} />
              <div className="flex items-center gap-3">
                <p className="text-xs text-charcoal/50">{formatQuantity(item.available_quantity, item.unit)} disponibles</p>
                <button
                  type="button"
                  onClick={onRemove}
                  className="inline-flex h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-charcoal/55 hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                  aria-label={`Retirer ${item.name} du panier`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" /> <span className="hidden sm:inline">Retirer</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
