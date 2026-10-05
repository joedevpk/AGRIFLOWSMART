import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/auth-context';

/**
 * Nombre réel de notifications non lues (requête count, RLS : propriétaire).
 * Rafraîchi au montage, au retour sur l'onglet et sur l'événement `agriflow:notifications`
 * (émis par la page Notifications après une lecture).
 */
export const NOTIFICATIONS_EVENT = 'agriflow:notifications';

export function useUnreadNotifications(): number {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!user) { setCount(0); return; }
    const { count: c, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false);
    if (!error) setCount(c ?? 0);
  }, [user]);

  useEffect(() => {
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener(NOTIFICATIONS_EVENT, onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(NOTIFICATIONS_EVENT, onFocus);
    };
  }, [refresh]);

  return count;
}
