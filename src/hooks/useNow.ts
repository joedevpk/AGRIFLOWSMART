import { useEffect, useState } from 'react';

/** « Maintenant » rafraîchi à intervalle fixe, uniquement quand `active` et que l'onglet est visible. */
export function useNow(intervalMs: number, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') setNow(Date.now()); }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, active]);
  return now;
}
