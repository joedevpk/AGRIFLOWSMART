import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { touchLastSeen } from '@/services/availabilityService';
import { PRESENCE_MIN_INTERVAL_MS } from '@/lib/order-confirmation';

/**
 * Présence légère : met à jour `last_seen_at` quand l'utilisateur utilise réellement la plateforme
 * (onglet visible + interaction). Aucune requête par mouvement de souris : les événements ne font que
 * comparer un horodatage ; au plus UNE écriture toutes les 5 minutes, et le serveur ignore en plus
 * tout appel survenant moins de 2 minutes après le précédent. Aucun timer, aucune boucle.
 */
export function useLastSeen(): void {
  const { user } = useAuth();
  const lastSent = useRef(0);
  const inFlight = useRef(false);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    lastSent.current = 0;

    const maybeTouch = () => {
      if (document.visibilityState !== 'visible' || inFlight.current) return;
      const now = Date.now();
      if (now - lastSent.current < PRESENCE_MIN_INTERVAL_MS) return;
      lastSent.current = now;
      inFlight.current = true;
      void touchLastSeen().finally(() => { inFlight.current = false; });
    };

    maybeTouch();
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'scroll', 'focus'];
    events.forEach((ev) => window.addEventListener(ev, maybeTouch, { passive: true }));
    document.addEventListener('visibilitychange', maybeTouch);
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, maybeTouch));
      document.removeEventListener('visibilitychange', maybeTouch);
    };
  }, [userId]);
}
