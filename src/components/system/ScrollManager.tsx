import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import {
  decideScroll,
  entryKey,
  readPositions,
  writePositions,
  type LocationLike,
  type PositionMap,
} from '@/lib/scroll-restoration';

const POLL_MS = 50;
const WAIT_MS = 2000;
const USER_EVENTS = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const;

function getStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Attend que `ready()` soit vrai (page chargée à la demande, données en cours d'affichage) puis applique `apply()`.
 * Annulé dès que l'utilisateur reprend la main (molette, toucher, clavier) : on ne lutte jamais contre lui.
 */
function whenReady(ready: () => boolean, apply: () => void, fallback: () => void): () => void {
  if (ready()) {
    apply();
    return () => undefined;
  }
  const start = Date.now();
  let timer: ReturnType<typeof setInterval> | null = null;
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
    USER_EVENTS.forEach((e) => window.removeEventListener(e, stop));
  };
  USER_EVENTS.forEach((e) => window.addEventListener(e, stop, { passive: true, once: true }));
  timer = setInterval(() => {
    if (ready()) {
      stop();
      apply();
    } else if (Date.now() - start > WAIT_MS) {
      stop();
      fallback();
    }
  }, POLL_MS);
  return stop;
}

const toTop = () => window.scrollTo({ top: 0, left: 0, behavior: 'instant' });

function anchorTarget(hash: string): HTMLElement | null {
  try {
    return document.getElementById(decodeURIComponent(hash.slice(1)));
  } catch {
    return null;
  }
}

/**
 * Gestion CENTRALE du défilement, montée une seule fois dans le routeur.
 * - Nouvelle route → haut de page (le footer n'apparaît qu'en descendant).
 * - Seuls les paramètres d'URL changent (filtres, onglets) → position conservée.
 * - Précédent / Suivant → position de l'entrée d'historique retrouvée (attend le contenu chargé).
 * - Ancre #section → défilement vers l'élément (attend son apparition ; repli : haut de page).
 * La restauration native du navigateur est désactivée : avec des pages chargées à la demande elle s'applique
 * avant que le contenu existe et se retrouve ramenée en bas de page.
 */
export function ScrollManager() {
  const location = useLocation();
  const navType = useNavigationType();
  const keyRef = useRef(entryKey(location));
  const prevRef = useRef<LocationLike | null>(null);
  const positions = useRef<PositionMap>({});
  const cancelRef = useRef<() => void>(() => undefined);
  const loadedRef = useRef(false);

  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        positions.current[keyRef.current] = window.scrollY;
      });
    };
    const persist = () => writePositions(getStorage(), positions.current);
    const onVisibility = () => { if (document.visibilityState === 'hidden') persist(); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', persist);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', persist);
      document.removeEventListener('visibilitychange', onVisibility);
      if (frame) window.cancelAnimationFrame(frame);
      persist();
      window.history.scrollRestoration = previous;
    };
  }, []);

  useLayoutEffect(() => {
    cancelRef.current();
    // Les positions doivent être lues AVANT le premier passage ici (les layout effects précèdent les effects).
    if (!loadedRef.current) {
      positions.current = readPositions(getStorage());
      loadedRef.current = true;
    }
    // Position de la page quittée figée avant d'attribuer les prochains événements de défilement à la nouvelle entrée.
    writePositions(getStorage(), positions.current);
    keyRef.current = entryKey(location);

    const next: LocationLike = { pathname: location.pathname, search: location.search, hash: location.hash };
    const action = decideScroll(navType, prevRef.current, next);
    prevRef.current = next;

    const goHashOrTop = () => {
      if (!next.hash) { toTop(); return () => undefined; }
      return whenReady(
        () => anchorTarget(next.hash) !== null,
        () => anchorTarget(next.hash)?.scrollIntoView({ block: 'start', behavior: 'instant' }),
        toTop,
      );
    };

    if (action === 'top') {
      toTop();
    } else if (action === 'hash') {
      cancelRef.current = goHashOrTop();
    } else if (action === 'restore') {
      const saved = positions.current[keyRef.current];
      if (typeof saved === 'number' && saved > 0) {
        cancelRef.current = whenReady(
          () => document.documentElement.scrollHeight - window.innerHeight >= saved - 1,
          () => window.scrollTo({ top: saved, left: 0, behavior: 'instant' }),
          () => window.scrollTo({ top: saved, left: 0, behavior: 'instant' }),
        );
      } else {
        cancelRef.current = goHashOrTop();
      }
    }
    // action === 'keep' : filtres / onglets de la même page, on ne touche à rien.
    return () => cancelRef.current();
  }, [location, navType]);

  return null;
}
