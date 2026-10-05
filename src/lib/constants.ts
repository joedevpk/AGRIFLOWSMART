import type { OrderStatus, PaymentStatus, PaymentMethod, ProductStatus, RequestStatus, DeliveryStatus } from '@/types';

export const PROVINCES = [
  'Kinshasa',
  'Lubumbashi',
  'Kisangani',
  'Goma',
  'Bukavu',
  'Matadi',
  'Kikwit',
  'Mbuji-Mayi',
  'Kananga',
  'Bunia',
  'Beni',
  'Butembo',
] as const;

export const CATEGORIES = [
  { id: 'cereals', label: 'Céréales', icon: 'Wheat' },
  { id: 'tubers', label: 'Tubercules', icon: 'Sprout' },
  { id: 'vegetables', label: 'Légumes', icon: 'Carrot' },
  { id: 'fruits', label: 'Fruits', icon: 'Apple' },
  { id: 'cash_crops', label: 'Cultures de rente', icon: 'Coffee' },
  { id: 'legumes', label: 'Légumineuses', icon: 'Bean' },
  { id: 'oilseeds', label: 'Oléagineux', icon: 'Droplet' },
] as const;

export const PRODUCTS_CATALOG = [
  { name: 'Maïs', category: 'cereals' },
  { name: 'Riz', category: 'cereals' },
  { name: 'Manioc', category: 'tubers' },
  { name: 'Patate douce', category: 'tubers' },
  { name: 'Tomate', category: 'vegetables' },
  { name: 'Oignon', category: 'vegetables' },
  { name: 'Chou', category: 'vegetables' },
  { name: 'Haricot', category: 'legumes' },
  { name: 'Soja', category: 'legumes' },
  { name: 'Arachide', category: 'oilseeds' },
  { name: 'Cacao', category: 'cash_crops' },
  { name: 'Café', category: 'cash_crops' },
  { name: 'Palmiste', category: 'oilseeds' },
  { name: 'Banane', category: 'fruits' },
  { name: 'Mangue', category: 'fruits' },
] as const;

export const UNITS = ['kg', 'tonne', 'sac_50kg', 'sac_100kg', 'litre', 'sac'] as const;

export const UNIT_LABELS: Record<string, string> = {
  kg: 'kg',
  tonne: 'tonne',
  sac_50kg: 'sac de 50 kg',
  sac_100kg: 'sac de 100 kg',
  litre: 'litre',
  sac: 'sac',
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'En attente',
  confirmed: 'Confirmée',
  preparing: 'Préparation',
  ready: 'Prête',
  in_delivery: 'En livraison',
  delivered: 'Livrée',
  completed: 'Terminée',
  cancelled: 'Annulée',
};

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  confirmed: 'bg-blue-100 text-blue-700 border-blue-200',
  preparing: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  ready: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  in_delivery: 'bg-violet-100 text-violet-700 border-violet-200',
  delivered: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  completed: 'bg-green-100 text-green-700 border-green-200',
  cancelled: 'bg-rose-100 text-rose-700 border-rose-200',
};

export const ORDER_WORKFLOW: OrderStatus[] = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'in_delivery',
  'delivered',
  'completed',
];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'En attente',
  processing: 'En cours',
  demo_paid: 'Payé (démo)',
  paid: 'Payé',
  failed: 'Échoué',
  cancelled: 'Annulé',
  expired: 'Expiré',
  refunded: 'Remboursé',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  mobile_money: 'Mobile Money',
  card: 'Carte bancaire',
  cash_on_delivery: 'Paiement à la livraison',
};

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  available: 'Disponible',
  reserved: 'Réservé',
  sold_out: 'Épuisé',
  draft: 'Brouillon',
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  open: 'Ouverte',
  fulfilled: 'Satisfaite',
  closed: 'Fermée',
};

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  pending: 'À confirmer',
  preparing: 'En préparation',
  ready: 'Prête à partir',
  in_delivery: 'En livraison',
  delivered: 'Livrée',
  cancelled: 'Annulée',
};

export const BUYER_TYPE_LABELS: Record<string, string> = {
  restaurant: 'Restaurant',
  market: 'Marché',
  wholesaler: 'Grossiste',
  agro_industry: 'Agro-industrie',
  enterprise: 'Entreprise',
};

export const ROLE_LABELS: Record<string, string> = {
  producer: 'Producteur',
  cooperative: 'Coopérative',
  buyer: 'Acheteur',
  admin: 'Administrateur',
};

export function formatPrice(price: number, currency = 'USD'): string {
  const formatted = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(price);
  return `${formatted} ${currency}`;
}

export function formatQuantity(qty: number, unit: string): string {
  const formatted = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(qty);
  return `${formatted} ${UNIT_LABELS[unit] || unit}`;
}

export function formatDate(date: string | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(date: string): string {
  return new Date(date).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `il y a ${days} j`;
  if (hours > 0) return `il y a ${hours} h`;
  if (minutes > 0) return `il y a ${minutes} min`;
  return 'à l\'instant';
}
