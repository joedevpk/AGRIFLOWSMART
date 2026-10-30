/**
 * Préparation du mode hors connexion.
 * Ce que cela rend réellement disponible : l'application (pages, guides AgriGuide, calendrier — contenus embarqués
 * dans le code) une fois visitée en ligne, via un service worker. Ce que cela ne rend PAS disponible : les données
 * Supabase (produits, commandes…) — seules les données Ma Parcelle déjà consultées sont relues depuis le stockage local.
 */
/** Préfixe des caches du service worker (public/sw.js) ; le nom complet change à chaque build (`agriflow-shell-<empreinte>`). */
import { isNativeApp } from '@/lib/native/platform';

export const SHELL_CACHE_PREFIX = 'agriflow-shell-';

/** Cache COURANT du service worker : à l'activation, il supprime tous les autres caches au même préfixe → il n'en reste qu'un. */
export async function currentShellCacheName(): Promise<string | null> {
  const keys = (await caches.keys()).filter((k) => k.startsWith(SHELL_CACHE_PREFIX));
  return keys.length > 0 ? keys[keys.length - 1] : null;
}

export function offlineSupported(): boolean {
  // Application native : fichiers déjà embarqués, pas de Service Worker (voir lib/native/serviceWorker).
  return !isNativeApp() && typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof caches !== 'undefined';
}

export async function isOfflineReady(): Promise<boolean> {
  if (!offlineSupported()) return false;
  try {
    const name = await currentShellCacheName();
    if (!name) return false;
    const hit = await caches.match('/', { cacheName: name });
    return Boolean(hit) && Boolean(navigator.serviceWorker.controller);
  } catch {
    return false;
  }
}

export async function prepareOffline(): Promise<{ ok: boolean; cached: number; reason?: string }> {
  if (!offlineSupported()) return { ok: false, cached: 0, reason: 'Ce navigateur ne permet pas le mode hors connexion.' };
  if (navigator.onLine === false) return { ok: false, cached: 0, reason: 'Une connexion est nécessaire pour préparer le mode hors connexion.' };
  try {
    // Charge les modules Agri (chunks) pour qu'ils soient présents dans le cache.
    await Promise.allSettled([
      import('@/pages/agri/AgriGuidePage'), import('@/pages/agri/CropGuidePage'), import('@/pages/agri/CalendarPage'),
      import('@/pages/agri/PlotsPage'), import('@/pages/agri/PlotDetailPage'),
    ]);
    const urls = new Set<string>(['/']);
    const origin = location.origin;
    for (const e of performance.getEntriesByType('resource')) {
      try {
        const u = new URL(e.name);
        if (u.origin === origin && /\.(js|css|woff2?|svg|png|jpg|webp)$/i.test(u.pathname)) urls.add(u.pathname + u.search);
      } catch { /* ignoré */ }
    }
    // Le service worker doit être actif : sans lui il n'y a pas de cache courant et rien ne servirait hors connexion.
    const name = await currentShellCacheName();
    if (!name) return { ok: false, cached: 0, reason: 'Le mode hors connexion n\'est pas encore actif. Rechargez la page puis réessayez.' };
    const cache = await caches.open(name);
    let cached = 0;
    await Promise.all([...urls].map(async (u) => { try { await cache.add(u); cached += 1; } catch { /* ressource indisponible */ } }));
    return { ok: cached > 0, cached };
  } catch (e) {
    return { ok: false, cached: 0, reason: e instanceof Error ? e.message : 'Échec de la préparation' };
  }
}
