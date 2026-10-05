import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/logger';
import { failure, success, type ServiceResult } from './serviceResult';

/** Disponibilité producteur & présence. Toute écriture passe par une RPC (le serveur valide et limite). */

export async function setMyAvailability(available: boolean, until: Date | null): Promise<ServiceResult<null>> {
  try {
    const { data, error } = await supabase.rpc('set_my_availability', { p_available: available, p_until: until ? until.toISOString() : null });
    if (error) {
      reportError('availabilityService.setMyAvailability', error.message);
      return failure('UNAVAILABLE', 'availability.error');
    }
    if (data && typeof data === 'object' && (data as { ok?: boolean }).ok === true) return success(null);
    const code = (data as { code?: string } | null)?.code ?? 'UNKNOWN';
    return failure(code, code === 'INVALID_DATE' ? 'availability.invalidDate' : 'availability.error');
  } catch (err) {
    reportError('availabilityService.setMyAvailability', err);
    return failure('NETWORK', 'availability.error');
  }
}

/** Écrit `last_seen_at` (le serveur ignore l'appel s'il a déjà écrit il y a moins de 2 minutes). */
export async function touchLastSeen(): Promise<void> {
  const { error } = await supabase.rpc('touch_last_seen');
  if (error) reportError('availabilityService.touchLastSeen', error.message);
}

export interface ProducerPresence { user_id: string; last_seen_at: string | null; accepting: boolean }

/** Dernière activité de producteurs/coopératives uniquement (jamais d'acheteurs côté serveur). */
export async function fetchProducerPresence(userIds: string[]): Promise<ProducerPresence[]> {
  if (userIds.length === 0) return [];
  const { data, error } = await supabase.rpc('get_producer_presence', { p_user_ids: userIds.slice(0, 100) });
  if (error) {
    reportError('availabilityService.fetchProducerPresence', error.message);
    return [];
  }
  return (data ?? []) as ProducerPresence[];
}
