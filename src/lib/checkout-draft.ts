import type { DeliveryFormData, PaymentMethod } from '@/types';
import { EMPTY_DELIVERY } from '@/lib/validation';

/**
 * Brouillon de checkout conservé dans sessionStorage : un rafraîchissement de la page
 * ne fait pas perdre les informations saisies. Il ne contient AUCUNE donnée de
 * paiement (ni numéro de carte, ni identifiant de compte) — seulement la méthode choisie.
 */

export type CheckoutStep = 1 | 2 | 3;

export interface CheckoutDraft {
  step: CheckoutStep;
  delivery: DeliveryFormData;
  payment_method: PaymentMethod | null;
  /** Clé d'idempotence de la tentative en cours. */
  checkout_id: string;
  /** Signature du panier auquel la clé est rattachée (nouvelle clé si le panier change). */
  cart_signature: string;
}

const PREFIX = 'agriflow.checkout.v1';
const METHODS: PaymentMethod[] = ['mobile_money', 'card', 'cash_on_delivery'];

function key(userId: string): string {
  return `${PREFIX}:${userId}`;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export function newCheckoutId(): string {
  return crypto.randomUUID();
}

export function emptyDraft(signature: string): CheckoutDraft {
  return { step: 1, delivery: { ...EMPTY_DELIVERY }, payment_method: null, checkout_id: newCheckoutId(), cart_signature: signature };
}

export function readDraft(userId: string): CheckoutDraft | null {
  try {
    const raw = window.sessionStorage.getItem(key(userId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const d = parsed as Record<string, unknown>;
    const del = typeof d.delivery === 'object' && d.delivery !== null ? (d.delivery as Record<string, unknown>) : {};
    const step = d.step === 2 || d.step === 3 ? d.step : 1;
    const method = METHODS.find((m) => m === d.payment_method) ?? null;
    const checkoutId = str(d.checkout_id);
    if (!checkoutId) return null;
    return {
      step,
      delivery: {
        recipient_name: str(del.recipient_name),
        recipient_phone: str(del.recipient_phone),
        address: str(del.address),
        city: str(del.city),
        commune: str(del.commune),
        instructions: str(del.instructions),
      },
      payment_method: method,
      checkout_id: checkoutId,
      cart_signature: str(d.cart_signature),
    };
  } catch {
    return null;
  }
}

export function writeDraft(userId: string, draft: CheckoutDraft): void {
  try {
    window.sessionStorage.setItem(key(userId), JSON.stringify(draft));
  } catch {
    // stockage indisponible : le checkout reste utilisable, sans reprise après rafraîchissement
  }
}

export function clearDraft(userId: string): void {
  try {
    window.sessionStorage.removeItem(key(userId));
  } catch {
    // ignoré
  }
}
