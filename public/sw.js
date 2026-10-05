/* AgriFlow RDC — service worker minimal (mode faible connexion).
 * - Pages (navigation) : réseau d'abord ; repli sur la coquille de l'application (index.html, sans donnée utilisateur) si le réseau échoue.
 * - /assets/* (fichiers hachés par Vite) : cache d'abord.
 * - Autres fichiers statiques du même site : cache puis mise à jour en arrière-plan.
 *
 * Jamais interceptés ni mis en cache : les requêtes vers d'autres domaines (Supabase, CinetPay, images externes) → AUCUNE réponse
 * authentifiée, aucun paiement, aucune commande, aucun profil privé n'est stocké ici. Les requêtes avec en-tête Authorization,
 * les réponses `Cache-Control: no-store/private` et les pages privées/paiement ne sont pas mises en cache.
 *
 * Invalidation : `__BUILD_ID__` est remplacé à chaque build (plugin Vite `sw-build-id`) → un nouveau déploiement crée un
 * nouveau cache et l'ancien est supprimé à l'activation (les fichiers hachés obsolètes ne s'accumulent pas). */
const CACHE = 'agriflow-shell-__BUILD_ID__';
const PRIVATE_PREFIXES = ['/payment', '/orders', '/checkout', '/profile', '/admin', '/messages', '/producer', '/buyer', '/notifications'];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await caches.open(CACHE); // le cache courant existe dès l'activation (src/lib/offline/precache.ts le retrouve par son préfixe)
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('agriflow-shell-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

function cacheable(req, res) {
  if (!res || !res.ok || res.type !== 'basic') return false;
  if (req.headers.has('Authorization')) return false;
  const cc = (res.headers.get('Cache-Control') || '').toLowerCase();
  return !cc.includes('no-store') && !cc.includes('private');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/sw.js') return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(req);
        // Seule la coquille publique (accueil) est conservée pour le hors-connexion — jamais une page privée.
        const isPrivate = PRIVATE_PREFIXES.some((p) => url.pathname === p || url.pathname.startsWith(p + '/'));
        if (url.pathname === '/' && cacheable(req, res)) cache.put('/', res.clone());
        else if (!isPrivate && !(await cache.match('/')) && cacheable(req, res)) cache.put('/', res.clone());
        return res;
      } catch {
        return (await cache.match('/')) || new Response('Hors connexion', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (cacheable(req, res)) cache.put(req, res.clone());
        return res;
      } catch {
        return Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    const network = fetch(req).then((res) => { if (cacheable(req, res)) cache.put(req, res.clone()); return res; }).catch(() => hit || Response.error());
    return hit || network;
  })());
});
