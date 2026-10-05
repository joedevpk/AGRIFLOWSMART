import { createContext, useContext } from 'react';
import type { CartItem, CartTotals, LiveProduct } from '@/types';

export type AddToCartResult =
  | { ok: true; quantity: number; clamped: boolean }
  | { ok: false; message: string };

export type CartStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface CartContextValue {
  items: CartItem[];
  totals: CartTotals;
  /** Nombre de lignes (produits distincts) dans le panier. */
  count: number;
  status: CartStatus;
  /** true une fois le panier du compte courant chargé depuis le stockage (évite les faux « panier vide » au changement de compte). */
  ready: boolean;
  /** true une fois les prix/stocks relus en base au moins une fois. */
  verified: boolean;
  error: string | null;
  quantityInCart: (productId: string) => number;
  addToCart: (product: LiveProduct, quantity: number) => AddToCartResult;
  setQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  clear: () => void;
  refresh: () => Promise<boolean>;
}

export const CartContext = createContext<CartContextValue | undefined>(undefined);

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart doit être utilisé à l\'intérieur de <CartProvider>');
  return ctx;
}
