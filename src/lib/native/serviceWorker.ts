import { isNativeApp } from './platform';

/**
 * Service Worker :
 * - Web (production) : enregistré comme avant (mode faible connexion).
 * - Application native : NON enregistré. Les fichiers de l'application sont déjà embarqués dans l'application ; un cache de coquille
 *   persisterait entre deux mises à jour de l'application et pourrait servir une ancienne version. On supprime donc tout Service
 *   Worker / cache `agriflow-shell-*` éventuellement présent.
 */
export function registerServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (isNativeApp()) {
    void cleanupNativeServiceWorker();
    return;
  }
  if (!import.meta.env.PROD) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* le site fonctionne normalement sans service worker */ });
  });
}

export async function cleanupNativeServiceWorker(): Promise<void> {
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('agriflow-shell-')).map((k) => caches.delete(k)));
    }
  } catch { /* rien à nettoyer */ }
}
