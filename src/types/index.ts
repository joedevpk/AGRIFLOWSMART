export type UserRole = 'producer' | 'cooperative' | 'buyer' | 'admin';
export type BuyerType = 'restaurant' | 'market' | 'wholesaler' | 'agro_industry' | 'enterprise';
export type ProductStatus = 'available' | 'reserved' | 'sold_out' | 'draft';
export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'in_delivery' | 'delivered' | 'completed' | 'cancelled';
export type PaymentStatus = 'pending' | 'processing' | 'paid' | 'failed' | 'cancelled' | 'expired' | 'refunded' | 'demo_paid';
export type PaymentMethod = 'mobile_money' | 'card' | 'cash_on_delivery';
export type RequestStatus = 'open' | 'fulfilled' | 'closed';
export type DeliveryStatus = 'pending' | 'preparing' | 'ready' | 'in_delivery' | 'delivered' | 'cancelled';

export interface Profile {
  id: string;
  user_id: string;
  role: UserRole;
  buyer_type: BuyerType | null;
  full_name: string;
  phone: string | null;
  province: string | null;
  city: string | null;
  bio: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  /** Passe 23 : le producteur accepte-t-il de nouvelles commandes ? (colonne publique) */
  is_available_for_orders?: boolean;
  /** Passe 23 : fin d'une indisponibilité temporaire (réactivation automatique). */
  availability_until?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  user_id: string;
  name: string;
  category: string;
  variety: string | null;
  quantity: number;
  unit: string;
  price: number;
  currency: string;
  price_negotiable: boolean;
  province: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  availability_date: string | null;
  description: string | null;
  images: string[];
  status: ProductStatus;
  created_at: string;
  updated_at: string;
}

export interface BuyerRequest {
  id: string;
  user_id: string;
  product_name: string;
  category: string | null;
  quantity: number;
  unit: string;
  budget: number | null;
  currency: string;
  province: string | null;
  city: string | null;
  desired_date: string | null;
  description: string | null;
  status: RequestStatus;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  order_number: string;
  /** Regroupe les commandes créées par une même validation de panier (clé d'idempotence). */
  checkout_id: string | null;
  buyer_id: string;
  /** Référence héritée : renseignée uniquement pour les commandes à un seul produit. */
  product_id: string | null;
  producer_id: string;
  quantity: number | null;
  unit: string;
  subtotal: number;
  delivery_fee: number;
  total_amount: number;
  currency: string;
  status: OrderStatus;
  payment_method: PaymentMethod | null;
  payment_status: PaymentStatus;
  /** Commission plateforme prélevée sur cette commande (calculée à la confirmation du paiement). */
  platform_fee: number;
  /** Montant net dû au producteur (total - commission). `null` tant que le paiement n'est pas confirmé. */
  seller_amount: number | null;
  settlement_status: 'pending' | 'on_hold' | 'settled';
  delivery_address: string | null;
  delivery_city: string | null;
  notes: string | null;
  /** Passe 23 : échéance de confirmation par le producteur (`null` = le délai n'a pas encore démarré). */
  confirmation_deadline: string | null;
  confirmed_at: string | null;
  expired_at: string | null;
  cancel_reason: OrderCancelReason | null;
  created_at: string;
  updated_at: string;
}

export type OrderCancelReason = 'confirmation_expired' | 'producer_rejected' | 'producer_cancelled' | 'buyer_cancelled' | 'admin_cancelled';
export type RefundStatus = 'requested' | 'processing' | 'completed' | 'failed';

export interface Refund {
  id: string;
  order_id: string;
  payment_id: string;
  amount: number;
  currency: string;
  status: RefundStatus;
  created_at: string;
  updated_at: string;
}

/** Ligne de commande : conserve le nom et le PRIX au moment de l'achat. */
export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  producer_id: string;
  product_name: string;
  product_image: string | null;
  unit: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
  currency: string;
  created_at: string;
}

export interface Payment {
  id: string;
  order_id: string;
  user_id: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  provider: string;
  provider_reference: string | null;
  is_demo: boolean;
  internal_reference: string;
  provider_transaction_id: string | null;
  provider_status: string | null;
  checkout_url: string | null;
  failure_reason: string | null;
  phone_number: string | null;
  operator: string | null;
  paid_at: string | null;
  failed_at: string | null;
  cancelled_at: string | null;
  refunded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderStatusHistory {
  id: string;
  order_id: string;
  status: OrderStatus;
  changed_by: string | null;
  note: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  product_id: string | null;
  order_id: string | null;
  content: string;
  read_at: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export interface Favorite {
  id: string;
  user_id: string;
  product_id: string;
  created_at: string;
}

export interface Review {
  id: string;
  order_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface Delivery {
  id: string;
  order_id: string;
  status: DeliveryStatus;
  recipient_name: string | null;
  recipient_phone: string | null;
  address: string | null;
  city: string | null;
  commune: string | null;
  transport_type: string | null;
  distance_km: number | null;
  estimated_date: string | null;
  delivered_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Produit + profil du producteur. Les listes (marketplace, favoris, Agri-Match) ne chargent pas
 * `description`, `latitude`, `longitude` ni `updated_at` : ils sont donc facultatifs ici (la fiche produit les charge).
 */
export interface ProductWithProfile extends Omit<Product, 'description' | 'latitude' | 'longitude' | 'updated_at'>, Partial<Pick<Product, 'description' | 'latitude' | 'longitude' | 'updated_at'>> {
  profiles: (Pick<Profile, 'full_name' | 'city' | 'province' | 'avatar_url' | 'is_verified' | 'role'> & Partial<Pick<Profile, 'is_available_for_orders' | 'availability_until'>>) | null;
}

export type CounterpartProfile = Pick<Profile, 'user_id' | 'full_name' | 'city' | 'avatar_url' | 'is_verified'>;

/** Commande avec ses lignes, sa livraison, ses paiements et les profils des deux parties. */
export interface OrderWithDetails extends Order {
  order_items: OrderItem[];
  delivery: Delivery | null;
  payments: Payment[];
  refunds: Refund[];
  buyer_profile: CounterpartProfile | null;
  producer_profile: CounterpartProfile | null;
}

/* ------------------------------------------------------------------ */
/*  Panier / checkout                                                  */
/* ------------------------------------------------------------------ */

/**
 * Ligne de panier PERSISTÉE dans le navigateur. Le `snapshot` ne sert qu'à
 * l'affichage (ex. produit supprimé) : le prix facturé est toujours relu en base.
 */
export interface StoredCartItem {
  product_id: string;
  quantity: number;
  added_at: string;
  snapshot: {
    name: string;
    image: string | null;
    unit: string;
    unit_price: number;
    currency: string;
    producer_id: string;
    producer_name: string | null;
  };
}

/** Données produit lues en base au moment de l'affichage du panier. */
export interface LiveProduct {
  id: string;
  user_id: string;
  name: string;
  image: string | null;
  unit: string;
  price: number;
  currency: string;
  quantity: number;
  status: ProductStatus;
  availability_date: string | null;
  producer_name: string | null;
}

export type CartIssue =
  | 'removed'
  | 'unavailable'
  | 'insufficient_stock'
  | 'own_product'
  | 'price_missing';

export interface CartItem {
  product_id: string;
  producer_id: string;
  producer_name: string | null;
  name: string;
  image: string | null;
  unit: string;
  unit_price: number;
  currency: string;
  quantity: number;
  available_quantity: number;
  subtotal: number;
  issue: CartIssue | null;
  /** Ancien prix si le prix a changé depuis l'ajout au panier (information, non bloquant). */
  previous_price: number | null;
}

export interface CartTotals {
  currency: string | null;
  mixedCurrencies: boolean;
  itemCount: number;
  subtotal: number;
  deliveryFee: number | null;
  total: number;
  hasBlockingIssue: boolean;
}

export interface DeliveryFormData {
  recipient_name: string;
  recipient_phone: string;
  address: string;
  city: string;
  commune: string;
  instructions: string;
}

export interface CheckoutData {
  delivery: DeliveryFormData;
  payment_method: PaymentMethod | null;
}

export type DeliveryFormErrors = Partial<Record<keyof DeliveryFormData, string>>;

/** Alternative réelle proposée à l'acheteur après expiration / refus (retour de la RPC `order_alternatives`). */
export interface OrderAlternative {
  product_id: string;
  name: string;
  category: string | null;
  quantity: number;
  unit: string;
  price: number;
  currency: string;
  city: string | null;
  province: string | null;
  image: string | null;
  producer_id: string;
  producer_name: string | null;
  is_verified: boolean;
  covers_quantity: boolean;
  same_product: boolean;
}

export interface OrderEvent {
  id: string;
  order_id: string;
  event_type: string;
  actor_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}
