import type { OrderWithDetails, Product } from '@/types';

/**
 * Calculs du tableau de bord producteur — uniquement à partir des données réelles.
 * Seuil de stock : l'application n'en définit AUCUN (ni colonne, ni constante). On ne distingue donc
 * que deux états objectifs : « rupture » (quantité <= 0 ou statut Épuisé) et « en stock ». Pas de « stock faible » inventé.
 */
export type StockState = 'in_stock' | 'out_of_stock';

export function stockState(p: Pick<Product, 'quantity' | 'status'>): StockState {
  return p.quantity <= 0 || p.status === 'sold_out' ? 'out_of_stock' : 'in_stock';
}

export const STOCK_LABELS: Record<StockState, string> = { in_stock: 'En stock', out_of_stock: 'Rupture' };

export interface ProductBuckets {
  published: Product[];
  drafts: Product[];
  /** Offres « Disponible » dont la quantité est épuisée (incohérence à corriger par le producteur). */
  availableButEmpty: Product[];
  outOfStock: Product[];
}

export function bucketProducts(products: Product[]): ProductBuckets {
  return {
    published: products.filter((p) => p.status === 'available'),
    drafts: products.filter((p) => p.status === 'draft'),
    availableButEmpty: products.filter((p) => p.status === 'available' && p.quantity <= 0),
    outOfStock: products.filter((p) => stockState(p) === 'out_of_stock'),
  };
}

/** Date de encaissement réelle : paiement confirmé (`paid_at`), à défaut dernière mise à jour de la commande. */
export function paidDate(o: OrderWithDetails): string {
  const paid = o.payments.find((p) => p.status === 'paid' && !p.is_demo);
  return paid?.paid_at ?? o.updated_at;
}

/** Vente réelle : paiement réellement encaissé (les paiements de démonstration ne comptent jamais) et commande non annulée. */
export function isRealSale(o: OrderWithDetails): boolean {
  return o.payment_status === 'paid' && o.status !== 'cancelled';
}

export type SalesPeriod = '7d' | '30d' | 'all';
export const SALES_PERIODS: { id: SalesPeriod; label: string; days: number | null }[] = [
  { id: '7d', label: '7 jours', days: 7 },
  { id: '30d', label: '30 jours', days: 30 },
  { id: 'all', label: 'Tout', days: null },
];

export function salesInPeriod(orders: OrderWithDetails[], period: SalesPeriod, now = Date.now()): OrderWithDetails[] {
  const days = SALES_PERIODS.find((p) => p.id === period)?.days ?? null;
  return orders.filter((o) => {
    if (!isRealSale(o)) return false;
    if (days === null) return true;
    return now - new Date(paidDate(o)).getTime() <= days * 86400000;
  });
}

/** Totaux par devise (jamais d'addition entre devises). */
export function totalsByCurrency(rows: { currency: string; amount: number }[]): { currency: string; amount: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.currency, (map.get(r.currency) ?? 0) + r.amount);
  return Array.from(map, ([currency, amount]) => ({ currency, amount }));
}

export interface SoldProduct { name: string; unit: string; quantity: number }

export function soldProducts(orders: OrderWithDetails[]): SoldProduct[] {
  const map = new Map<string, SoldProduct>();
  for (const o of orders) {
    for (const it of o.order_items) {
      const key = `${it.product_name}__${it.unit}`;
      const cur = map.get(key);
      if (cur) cur.quantity += it.quantity;
      else map.set(key, { name: it.product_name, unit: it.unit, quantity: it.quantity });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity);
}
