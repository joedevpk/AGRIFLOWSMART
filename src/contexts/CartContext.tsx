import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/contexts/auth-context';
import type { StoredCartItem } from '@/types';
import {
  MAX_CART_LINES,
  buildCartItems,
  clampQuantity,
  computeTotals,
  mergeStoredItems,
  normalizeStoredCart,
  type LiveProductMap,
} from '@/lib/cart';
import { fetchLiveProducts } from '@/services/cartService';
import { CartContext, type CartContextValue, type CartStatus, type AddToCartResult } from '@/contexts/cart-context';

export type { AddToCartResult };
import type { LiveProduct } from '@/types';

/**
 * Panier.
 *
 * - Le panier est un état LOCAL (contexte + localStorage), par compte ; le panier
 *   « invité » est fusionné dans celui du compte à la connexion.
 * - Prix, stock, statut et producteur viennent de Supabase (`refresh`). Le navigateur
 *   n'est jamais la source de vérité : à la commande, la RPC serveur revalide tout.
 */

const STORAGE_PREFIX = 'agriflow.cart.v1';

function readStored(key: string): StoredCartItem[] {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? normalizeStoredCart(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

function writeStored(key: string, items: StoredCartItem[]): void {
  try {
    const next = JSON.stringify(items);
    if (window.localStorage.getItem(key) !== next) window.localStorage.setItem(key, next);
  } catch {
    // stockage indisponible (mode privé, quota) : le panier reste en mémoire pour la session
  }
}

function removeStored(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignoré
  }
}

interface Store {
  key: string;
  items: StoredCartItem[];
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const storageKey = `${STORAGE_PREFIX}:${userId ?? 'guest'}`;

  const [store, setStore] = useState<Store>(() => ({ key: storageKey, items: readStored(storageKey) }));
  const [live, setLive] = useState<LiveProductMap>({});
  const [status, setStatus] = useState<CartStatus>('idle');
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itemsRef = useRef(store.items);
  itemsRef.current = store.items;
  const liveRef = useRef(live);
  liveRef.current = live;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  // Changement de compte : recharge le panier du nouveau compte et y fusionne le panier invité.
  useEffect(() => {
    if (store.key === storageKey) return;
    const loaded = readStored(storageKey);
    let items = loaded;
    if (store.key.endsWith(':guest') && userId) {
      items = mergeStoredItems(loaded, store.items);
      removeStored(store.key);
    }
    setStore({ key: storageKey, items });
    setLive({});
    setVerified(false);
    setStatus('idle');
    setError(null);
  }, [storageKey, userId, store]);

  // Persistance (uniquement pour le compte courant, jamais pendant un changement de compte).
  useEffect(() => {
    if (store.key !== storageKey) return;
    writeStored(store.key, store.items);
  }, [store, storageKey]);

  // Synchronisation entre onglets.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== store.key) return;
      setStore((current) => (current.key === e.key ? { key: current.key, items: readStored(current.key) } : current));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [store.key]);

  const items = useMemo(() => buildCartItems(store.items, live, userId), [store.items, live, userId]);
  const totals = useMemo(() => computeTotals(items), [items]);

  const refresh = useCallback(async (): Promise<boolean> => {
    const ids = itemsRef.current.map((i) => i.product_id);
    if (ids.length === 0) {
      setLive({});
      setVerified(true);
      setStatus('ready');
      setError(null);
      return true;
    }
    setStatus('loading');
    const result = await fetchLiveProducts(ids);
    if (!result.ok) {
      setStatus('error');
      setError(result.message);
      return false;
    }
    setLive((prev) => ({ ...prev, ...result.data }));
    setVerified(true);
    setStatus('ready');
    setError(null);
    return true;
  }, []);

  const quantityInCart = useCallback(
    (productId: string) => store.items.find((i) => i.product_id === productId)?.quantity ?? 0,
    [store.items],
  );

  const addToCart = useCallback((product: LiveProduct, quantity: number): AddToCartResult => {
    if (!Number.isInteger(quantity) || quantity <= 0) return { ok: false, message: 'Indiquez une quantité valide.' };
    if (product.status !== 'available') return { ok: false, message: 'Ce produit n\'est plus disponible.' };
    if (!(product.price > 0)) return { ok: false, message: 'Le prix de ce produit n\'est pas encore défini.' };
    if (userIdRef.current && product.user_id === userIdRef.current) {
      return { ok: false, message: 'Vous ne pouvez pas commander votre propre production.' };
    }
    const max = Math.floor(product.quantity);
    if (max < 1) return { ok: false, message: 'Ce produit est épuisé.' };

    const current = itemsRef.current;
    const existing = current.find((i) => i.product_id === product.id);
    const currencies = new Set(current.filter((i) => i.product_id !== product.id).map((i) => i.snapshot.currency));
    if (currencies.size > 0 && !currencies.has(product.currency)) {
      return { ok: false, message: 'Votre panier contient des produits dans une autre devise. Passez d\'abord cette commande.' };
    }
    if (!existing && current.length >= MAX_CART_LINES) {
      return { ok: false, message: 'Votre panier est plein. Passez commande avant d\'ajouter d\'autres produits.' };
    }
    const already = existing?.quantity ?? 0;
    if (already >= max) {
      return { ok: false, message: 'La quantité maximale disponible est déjà dans votre panier.' };
    }

    const wanted = already + quantity;
    const next = Math.min(max, wanted);
    const entry: StoredCartItem = {
      product_id: product.id,
      quantity: next,
      added_at: existing?.added_at ?? new Date().toISOString(),
      snapshot: {
        name: product.name,
        image: product.image,
        unit: product.unit,
        unit_price: existing?.snapshot.unit_price ?? product.price,
        currency: product.currency,
        producer_id: product.user_id,
        producer_name: product.producer_name,
      },
    };
    setStore((s) => ({
      key: s.key,
      items: existing ? s.items.map((i) => (i.product_id === product.id ? entry : i)) : [...s.items, entry],
    }));
    setLive((prev) => ({ ...prev, [product.id]: product }));
    return { ok: true, quantity: next, clamped: wanted > max };
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    const product = liveRef.current[productId];
    const cap = product ? Math.floor(product.quantity) : Number.MAX_SAFE_INTEGER;
    const next = clampQuantity(quantity, cap < 1 ? 1 : cap);
    setStore((s) => ({ key: s.key, items: s.items.map((i) => (i.product_id === productId ? { ...i, quantity: next } : i)) }));
  }, []);

  const removeItem = useCallback((productId: string) => {
    setStore((s) => ({ key: s.key, items: s.items.filter((i) => i.product_id !== productId) }));
  }, []);

  const clear = useCallback(() => {
    setStore((s) => ({ key: s.key, items: [] }));
    setLive({});
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      totals,
      count: store.items.length,
      ready: store.key === storageKey,
      status,
      verified,
      error,
      quantityInCart,
      addToCart,
      setQuantity,
      removeItem,
      clear,
      refresh,
    }),
    [items, totals, store.items.length, store.key, storageKey, status, verified, error, quantityInCart, addToCart, setQuantity, removeItem, clear, refresh],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
