import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/logger';
import type { LiveProduct, ProductStatus } from '@/types';
import type { LiveProductMap } from '@/lib/cart';
import { GENERIC_LOAD_ERROR, failure, success, type ServiceResult } from './serviceResult';

interface ProductRow {
  id: string;
  user_id: string;
  name: string;
  images: string[] | null;
  unit: string;
  price: number;
  currency: string;
  quantity: number;
  status: ProductStatus;
  availability_date: string | null;
}

interface ProducerRow {
  user_id: string;
  full_name: string;
}

/**
 * Relit en base l'état ACTUEL (prix, stock, statut) des produits du panier.
 * Un produit absent de la réponse (supprimé) est marqué `null`.
 * Les colonnes lues sont publiques (policy `products_public_read`).
 */
export async function fetchLiveProducts(ids: string[]): Promise<ServiceResult<LiveProductMap>> {
  if (ids.length === 0) return success({});
  try {
    const { data, error } = await supabase
      .from('products')
      .select('id, user_id, name, images, unit, price, currency, quantity, status, availability_date')
      .in('id', ids);
    if (error) {
      reportError('cartService.fetchLiveProducts', error.message);
      return failure('LOAD_FAILED', GENERIC_LOAD_ERROR);
    }
    const rows = (data ?? []) as ProductRow[];

    const producerIds = Array.from(new Set(rows.map((r) => r.user_id)));
    const names = new Map<string, string>();
    if (producerIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('user_id, full_name').in('user_id', producerIds);
      for (const p of (profiles ?? []) as ProducerRow[]) names.set(p.user_id, p.full_name);
    }

    const map: LiveProductMap = {};
    for (const id of ids) map[id] = null;
    for (const r of rows) {
      const live: LiveProduct = {
        id: r.id,
        user_id: r.user_id,
        name: r.name,
        image: r.images && r.images.length > 0 ? r.images[0] : null,
        unit: r.unit,
        price: Number(r.price),
        currency: r.currency,
        quantity: Number(r.quantity),
        status: r.status,
        availability_date: r.availability_date,
        producer_name: names.get(r.user_id) ?? null,
      };
      map[r.id] = live;
    }
    return success(map);
  } catch (err) {
    reportError('cartService.fetchLiveProducts', err);
    return failure('NETWORK', GENERIC_LOAD_ERROR);
  }
}
