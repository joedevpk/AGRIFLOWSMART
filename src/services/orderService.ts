import { ORDER_HISTORY_COLUMNS, ORDER_WITH_DETAILS } from '@/lib/columns';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/logger';
import { round2 } from '@/lib/cart';
import type {
  CartItem,
  CounterpartProfile,
  Delivery,
  DeliveryFormData,
  DeliveryFormErrors,
  Order,
  OrderItem,
  OrderStatus,
  OrderStatusHistory,
  OrderWithDetails,
  Payment,
  PaymentMethod,
  Refund,
} from '@/types';
import { GENERIC_LOAD_ERROR, failure, success, type ServiceResult } from './serviceResult';

/* ------------------------------------------------------------------ */
/*  Messages d'erreur (codes renvoyés par les RPC)                     */
/* ------------------------------------------------------------------ */

const ERROR_MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: 'Votre session a expiré. Reconnectez-vous pour continuer.',
  EMPTY_CART: 'Votre panier est vide.',
  CART_TOO_LARGE: 'Votre panier contient trop de produits. Passez plusieurs commandes.',
  INVALID_ITEMS: 'Certains produits du panier sont invalides. Mettez votre panier à jour.',
  INVALID_DELIVERY: 'Vérifiez les informations de livraison.',
  INVALID_PAYMENT_METHOD: 'Choisissez un mode de paiement.',
  CART_INVALID: 'La quantité disponible a changé. Veuillez mettre votre panier à jour.',
  MIXED_CURRENCY: 'Votre panier mélange plusieurs devises. Commandez ces produits séparément.',
  PRICE_CHANGED: 'Les prix ont changé depuis l\'affichage de votre panier. Vérifiez le nouveau total avant de confirmer.',
  INVALID_TRANSITION: 'Cette action n\'est plus possible : la commande a déjà été mise à jour. Actualisez la page.',
  PAYMENT_REQUIRED: 'Le paiement de cette commande n\'est pas encore confirmé.',
  ORDER_NOT_FOUND: 'Cette commande n\'existe pas ou vous n\'y avez pas accès.',
  INVALID_PAYMENT_STATE: 'Le paiement de cette commande ne peut pas être confirmé.',
  ORDER_NOT_DELIVERED: 'Le paiement à la livraison ne peut être confirmé qu\'après la livraison.',
  INVALID_STATUS: 'Statut de commande invalide.',
  FORBIDDEN: 'Action non autorisée.',
};

export const ORDER_CREATE_FALLBACK = 'Impossible de créer la commande pour le moment.';

function messageFor(code: string, fallback: string): string {
  return ERROR_MESSAGES[code] ?? fallback;
}

/** Erreur PostgREST « fonction introuvable » : la migration n'a pas été appliquée. */
function isMissingFunction(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST202' || /could not find the function/i.test(error.message ?? '');
}

/* ------------------------------------------------------------------ */
/*  Création de commande depuis le panier                              */
/* ------------------------------------------------------------------ */

export interface CheckoutOrderSummary {
  id: string;
  order_number: string;
  producer_id: string;
  total_amount: number;
  currency: string;
  status: OrderStatus;
  payment_status: string;
}

export interface CheckoutSuccess {
  checkout_id: string;
  /** true si la commande existait déjà (rejeu idempotent d'une requête déjà traitée). */
  replayed: boolean;
  currency: string | null;
  total_amount: number;
  orders: CheckoutOrderSummary[];
}

export interface CartIssuePayload {
  product_id: string;
  name: string | null;
  reason: 'removed' | 'unavailable' | 'insufficient_stock' | 'own_product' | 'price_missing';
  available: number;
  requested: number;
}

export interface CreateOrderInput {
  checkoutId: string;
  items: Pick<CartItem, 'product_id' | 'quantity'>[];
  delivery: DeliveryFormData;
  paymentMethod: PaymentMethod;
  /** Total affiché à l'écran : le serveur refuse si les prix ont changé entre-temps. */
  expectedTotal: number;
}

export type CreateOrderResult =
  | { ok: true; data: CheckoutSuccess }
  | {
      ok: false;
      code: string;
      message: string;
      /** Erreur technique (réseau, serveur) : proposer « Réessayer ». */
      retryable: boolean;
      issues?: CartIssuePayload[];
      fields?: DeliveryFormErrors;
      serverTotal?: number;
    };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseCheckoutSuccess(payload: Record<string, unknown>): CheckoutSuccess | null {
  const rawOrders = payload.orders;
  if (!Array.isArray(rawOrders) || rawOrders.length === 0) return null;
  const orders: CheckoutOrderSummary[] = [];
  for (const o of rawOrders) {
    if (!isObject(o) || typeof o.id !== 'string' || typeof o.order_number !== 'string') return null;
    orders.push({
      id: o.id,
      order_number: o.order_number,
      producer_id: typeof o.producer_id === 'string' ? o.producer_id : '',
      total_amount: Number(o.total_amount),
      currency: typeof o.currency === 'string' ? o.currency : 'USD',
      status: o.status as OrderStatus,
      payment_status: typeof o.payment_status === 'string' ? o.payment_status : 'pending',
    });
  }
  return {
    checkout_id: typeof payload.checkout_id === 'string' ? payload.checkout_id : '',
    replayed: payload.replayed === true,
    currency: typeof payload.currency === 'string' ? payload.currency : null,
    total_amount: Number(payload.total_amount),
    orders,
  };
}

/**
 * Crée les commandes via la RPC transactionnelle `create_order_from_cart`.
 * Le serveur revalide produits, stock et prix, recalcule le total, décrémente le
 * stock et crée commande(s) + lignes + paiement + livraison + notifications en une
 * seule transaction. Rejouer le même `checkoutId` ne crée jamais de doublon.
 */
export async function createOrderFromCart(input: CreateOrderInput): Promise<CreateOrderResult> {
  const technical = (): CreateOrderResult => ({ ok: false, code: 'UNAVAILABLE', message: ORDER_CREATE_FALLBACK, retryable: true });

  try {
    const { data, error } = await supabase.rpc('create_order_from_cart', {
      p_checkout_id: input.checkoutId,
      p_items: input.items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
      p_delivery: {
        recipient_name: input.delivery.recipient_name,
        recipient_phone: input.delivery.recipient_phone,
        address: input.delivery.address,
        city: input.delivery.city,
        commune: input.delivery.commune,
        instructions: input.delivery.instructions,
      },
      p_payment_method: input.paymentMethod,
      p_expected_total: round2(input.expectedTotal),
    });

    if (error) {
      reportError('orderService.createOrderFromCart', error.message);
      if (/PRODUCER_UNAVAILABLE/.test(error.message ?? '')) {
        // Défense serveur (trigger) : un producteur du panier a désactivé la réception de commandes.
        return { ok: false, code: 'PRODUCER_UNAVAILABLE', message: 'Ce producteur n\'accepte pas actuellement de nouvelles commandes. Retirez ses produits de votre panier ou réessayez plus tard.', retryable: false };
      }
      if (isMissingFunction(error)) {
        return { ok: false, code: 'SERVICE_MISSING', message: 'Le service de commande n\'est pas disponible pour le moment.', retryable: false };
      }
      return technical();
    }
    if (!isObject(data)) return technical();

    if (data.ok === true) {
      const parsed = parseCheckoutSuccess(data);
      return parsed ? { ok: true, data: parsed } : technical();
    }

    const code = typeof data.code === 'string' ? data.code : 'UNKNOWN';
    return {
      ok: false,
      code,
      message: messageFor(code, ORDER_CREATE_FALLBACK),
      retryable: false,
      issues: Array.isArray(data.issues) ? (data.issues as CartIssuePayload[]) : undefined,
      fields: isObject(data.fields) ? (data.fields as DeliveryFormErrors) : undefined,
      serverTotal: typeof data.server_total === 'number' ? data.server_total : undefined,
    };
  } catch (err) {
    reportError('orderService.createOrderFromCart', err);
    return technical();
  }
}

/* ------------------------------------------------------------------ */
/*  Lecture des commandes                                              */
/* ------------------------------------------------------------------ */

const ORDER_SELECT = ORDER_WITH_DETAILS;
const PROFILE_SELECT = 'user_id, full_name, city, avatar_url, is_verified';

interface RawOrderRow extends Order {
  order_items: OrderItem[] | null;
  delivery: Delivery | Delivery[] | null;
  payments: Payment[] | null;
  refunds: Refund[] | null;
}

function toNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}

function normalizeRow(row: RawOrderRow, profiles: Map<string, CounterpartProfile>): OrderWithDetails {
  const delivery = Array.isArray(row.delivery) ? (row.delivery[0] ?? null) : row.delivery ?? null;
  const items = (row.order_items ?? [])
    .map((i) => ({ ...i, unit_price: toNumber(i.unit_price), quantity: toNumber(i.quantity), subtotal: toNumber(i.subtotal) }))
    .sort((a, b) => a.product_name.localeCompare(b.product_name, 'fr'));
  const payments = [...(row.payments ?? [])]
    .map((p) => ({ ...p, amount: toNumber(p.amount) }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return {
    ...row,
    quantity: row.quantity === null ? null : toNumber(row.quantity),
    subtotal: toNumber(row.subtotal),
    delivery_fee: toNumber(row.delivery_fee),
    total_amount: toNumber(row.total_amount),
    order_items: items,
    delivery,
    payments,
    refunds: [...(row.refunds ?? [])].map((r) => ({ ...r, amount: toNumber(r.amount) })).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    buyer_profile: profiles.get(row.buyer_id) ?? null,
    producer_profile: profiles.get(row.producer_id) ?? null,
  };
}

async function hydrate(rows: RawOrderRow[]): Promise<OrderWithDetails[]> {
  const ids = Array.from(new Set(rows.flatMap((r) => [r.buyer_id, r.producer_id])));
  const profiles = new Map<string, CounterpartProfile>();
  if (ids.length > 0) {
    // Colonnes publiques uniquement (le téléphone est protégé par les privilèges de colonne).
    const { data } = await supabase.from('profiles').select(PROFILE_SELECT).in('user_id', ids);
    for (const p of (data ?? []) as CounterpartProfile[]) profiles.set(p.user_id, p);
  }
  return rows.map((r) => normalizeRow(r, profiles));
}

export async function fetchOrders(role: 'buyer' | 'producer', userId: string): Promise<ServiceResult<OrderWithDetails[]>> {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select(ORDER_SELECT)
      .eq(role === 'buyer' ? 'buyer_id' : 'producer_id', userId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      reportError('orderService.fetchOrders', error.message);
      return failure('LOAD_FAILED', GENERIC_LOAD_ERROR);
    }
    return success(await hydrate((data ?? []) as RawOrderRow[]));
  } catch (err) {
    reportError('orderService.fetchOrders', err);
    return failure('NETWORK', GENERIC_LOAD_ERROR);
  }
}

export interface OrdersPage { items: OrderWithDetails[]; hasMore: boolean }

/** Commandes de lignes `[from, to]` (bornes incluses) : sert aux listes paginées et à leur rafraîchissement. */
export async function fetchOrdersRange(role: 'buyer' | 'producer', userId: string, from: number, to: number): Promise<ServiceResult<OrdersPage>> {
  try {
    const size = to - from; // `to` contient déjà la ligne supplémentaire qui signale une page suivante
    const { data, error } = await supabase
      .from('orders')
      .select(ORDER_SELECT)
      .eq(role === 'buyer' ? 'buyer_id' : 'producer_id', userId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);
    if (error) {
      reportError('orderService.fetchOrdersRange', error.message, { fn: 'fetchOrdersRange' });
      return failure('LOAD_FAILED', GENERIC_LOAD_ERROR);
    }
    const rows = (data ?? []) as RawOrderRow[];
    return success({ items: await hydrate(rows.slice(0, size)), hasMore: rows.length > size });
  } catch (err) {
    reportError('orderService.fetchOrdersRange', err);
    return failure('NETWORK', GENERIC_LOAD_ERROR);
  }
}

/** `null` = commande introuvable ou inaccessible (RLS). */
export async function fetchOrderById(orderId: string): Promise<ServiceResult<OrderWithDetails | null>> {
  try {
    const { data, error } = await supabase.from('orders').select(ORDER_SELECT).eq('id', orderId).maybeSingle();
    if (error) {
      reportError('orderService.fetchOrderById', error.message);
      return failure('LOAD_FAILED', GENERIC_LOAD_ERROR);
    }
    if (!data) return success(null);
    const [order] = await hydrate([data as RawOrderRow]);
    return success(order);
  } catch (err) {
    reportError('orderService.fetchOrderById', err);
    return failure('NETWORK', GENERIC_LOAD_ERROR);
  }
}

export async function fetchOrdersByCheckout(checkoutId: string, buyerId: string): Promise<ServiceResult<OrderWithDetails[]>> {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select(ORDER_SELECT)
      .eq('checkout_id', checkoutId)
      .eq('buyer_id', buyerId)
      .order('created_at', { ascending: true });
    if (error) {
      reportError('orderService.fetchOrdersByCheckout', error.message);
      return failure('LOAD_FAILED', GENERIC_LOAD_ERROR);
    }
    return success(await hydrate((data ?? []) as RawOrderRow[]));
  } catch (err) {
    reportError('orderService.fetchOrdersByCheckout', err);
    return failure('NETWORK', GENERIC_LOAD_ERROR);
  }
}

export async function fetchOrderTimeline(orderId: string): Promise<ServiceResult<OrderStatusHistory[]>> {
  try {
    const { data, error } = await supabase
      .from('order_status_history')
      .select(ORDER_HISTORY_COLUMNS)
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });
    if (error) {
      reportError('orderService.fetchOrderTimeline', error.message);
      return failure('LOAD_FAILED', GENERIC_LOAD_ERROR);
    }
    return success((data ?? []) as OrderStatusHistory[]);
  } catch (err) {
    reportError('orderService.fetchOrderTimeline', err);
    return failure('NETWORK', GENERIC_LOAD_ERROR);
  }
}

/* ------------------------------------------------------------------ */
/*  Mutations via RPC (transitions contrôlées côté serveur)            */
/* ------------------------------------------------------------------ */

export async function callOrderRpc(
  fn: 'transition_order_status' | 'confirm_cash_payment',
  args: Record<string, unknown>,
): Promise<ServiceResult<null>> {
  try {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) {
      reportError(`orderService.${fn}`, error.message);
      return failure('UNAVAILABLE', 'Action impossible pour le moment. Vérifiez votre connexion puis réessayez.');
    }
    if (isObject(data) && data.ok === true) return success(null);
    const code = isObject(data) && typeof data.code === 'string' ? data.code : 'UNKNOWN';
    return failure(code, messageFor(code, 'Action impossible pour le moment.'));
  } catch (err) {
    reportError(`orderService.${fn}`, err);
    return failure('NETWORK', 'Action impossible pour le moment. Vérifiez votre connexion puis réessayez.');
  }
}

export function transitionOrderStatus(orderId: string, to: OrderStatus, note?: string): Promise<ServiceResult<null>> {
  return callOrderRpc('transition_order_status', { p_order_id: orderId, p_new_status: to, p_note: note ?? null });
}
