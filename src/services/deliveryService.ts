import type { Delivery, OrderWithDetails } from '@/types';

/**
 * Livraison.
 * Aucun service de livraison ni calcul de distance n'est connecté : on n'affiche jamais
 * de frais, de distance ou de date qui ne soient pas réellement renseignés.
 */
export interface DeliveryEstimate {
  fee: number | null;
  label: string;
  hint: string;
}

export function estimateDelivery(): DeliveryEstimate {
  return {
    fee: null,
    label: 'Livraison à confirmer',
    hint: 'Les frais et la date de livraison sont confirmés avec le producteur après la commande.',
  };
}

export function formatDeliveryAddress(delivery: Delivery | null, order?: Pick<OrderWithDetails, 'delivery_address' | 'delivery_city'>): string {
  const address = delivery?.address ?? order?.delivery_address ?? '';
  const commune = delivery?.commune ?? '';
  const city = delivery?.city ?? order?.delivery_city ?? '';
  return [address, commune, city].map((p) => p.trim()).filter(Boolean).join(', ');
}

/** Date estimée : uniquement si elle a réellement été renseignée par le producteur. */
export function deliveryEta(delivery: Delivery | null): string | null {
  if (!delivery) return null;
  if (delivery.status === 'delivered' && delivery.delivered_at) return delivery.delivered_at;
  return delivery.estimated_date;
}
