/**
 * État de connexion : ONLINE / LIMITED / OFFLINE.
 *  - offline : `navigator.onLine === false`
 *  - limited : connexion lente signalée par le navigateur (2G, latence élevée, mode économie de données)
 *              OU échec réseau récent lors d'une requête vers le serveur (détection par l'usage,
 *              utile sur les navigateurs sans « Network Information API », comme Safari ou Firefox)
 *  - online  : sinon
 * Ce n'est pas une mesure exacte de la qualité du réseau.
 */
export type ConnectionState = 'online' | 'limited' | 'offline';

interface NetInfo { effectiveType?: string; rtt?: number; downlink?: number; saveData?: boolean; addEventListener?: (t: string, cb: () => void) => void; removeEventListener?: (t: string, cb: () => void) => void }

const DEGRADED_MS = 60_000;
let degradedUntil = 0;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

/** À appeler quand une requête réseau échoue alors que le navigateur se croit en ligne. */
export function reportNetworkFailure(): void {
  degradedUntil = Date.now() + DEGRADED_MS;
  emit();
  setTimeout(emit, DEGRADED_MS + 50);
}

export function reportNetworkSuccess(): void {
  if (degradedUntil !== 0) { degradedUntil = 0; emit(); }
}

function netInfo(): NetInfo | undefined {
  return (navigator as unknown as { connection?: NetInfo }).connection;
}

export function currentConnectionState(): ConnectionState {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  const c = typeof navigator !== 'undefined' ? netInfo() : undefined;
  const slowType = c?.effectiveType === 'slow-2g' || c?.effectiveType === '2g';
  const slowLink = (typeof c?.rtt === 'number' && c.rtt > 1500) || (typeof c?.downlink === 'number' && c.downlink > 0 && c.downlink < 0.4);
  if (slowType || slowLink || c?.saveData === true || Date.now() < degradedUntil) return 'limited';
  return 'online';
}

export function subscribeConnection(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  const c = netInfo();
  c?.addEventListener?.('change', cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
    c?.removeEventListener?.('change', cb);
  };
}

/** Détecte les erreurs réseau (fetch échoué) par opposition aux erreurs métier ou de permission. */
export function isNetworkError(message: string | undefined | null): boolean {
  return /failed to fetch|networkerror|network request failed|load failed|connection|timeout|timed out|err_internet|err_network/i.test(message ?? '');
}
