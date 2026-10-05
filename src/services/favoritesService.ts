import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/logger';
import { GENERIC_LOAD_ERROR, failure, success, type ServiceResult } from './serviceResult';

/**
 * Favoris. Table `favorites` (user_id, product_id, UNIQUE(user_id, product_id)),
 * RLS : lecture/écriture/suppression réservées au propriétaire (auth.uid() = user_id).
 */

export async function isProductFavorited(userId: string, productId: string): Promise<ServiceResult<boolean>> {
  try {
    const { data, error } = await supabase
      .from('favorites')
      .select('id')
      .eq('user_id', userId)
      .eq('product_id', productId)
      .maybeSingle();
    if (error) {
      reportError('favoritesService.isProductFavorited', error.message);
      return failure('LOAD_FAILED', GENERIC_LOAD_ERROR);
    }
    return success(!!data);
  } catch (err) {
    reportError('favoritesService.isProductFavorited', err);
    return failure('NETWORK', GENERIC_LOAD_ERROR);
  }
}

export async function fetchFavoriteProductIds(userId: string): Promise<ServiceResult<string[]>> {
  try {
    const { data, error } = await supabase.from('favorites').select('product_id').eq('user_id', userId);
    if (error) {
      reportError('favoritesService.fetchFavoriteProductIds', error.message);
      return failure('LOAD_FAILED', GENERIC_LOAD_ERROR);
    }
    return success((data ?? []).map((row) => row.product_id as string));
  } catch (err) {
    reportError('favoritesService.fetchFavoriteProductIds', err);
    return failure('NETWORK', GENERIC_LOAD_ERROR);
  }
}

export async function addFavorite(userId: string, productId: string): Promise<boolean> {
  // UNIQUE(user_id, product_id) : un double clic ne crée pas de doublon.
  const { error } = await supabase.from('favorites').insert({ user_id: userId, product_id: productId });
  if (error && error.code !== '23505') {
    reportError('favoritesService.addFavorite', error.message);
    return false;
  }
  return true;
}

export async function removeFavorite(userId: string, productId: string): Promise<boolean> {
  const { error } = await supabase.from('favorites').delete().eq('user_id', userId).eq('product_id', productId);
  if (error) {
    reportError('favoritesService.removeFavorite', error.message);
    return false;
  }
  return true;
}
