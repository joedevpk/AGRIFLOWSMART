/**
 * Règles de défilement lors d'un changement de route (fonctions pures, testées).
 *
 * Le défilement du site est celui de `window` (aucun conteneur interne ne porte la page).
 * Sans gestion explicite, un `<Link>` conserve la position de la page précédente : la nouvelle page
 * s'ouvre alors au niveau du footer. `ScrollManager` applique ces règles de façon centralisée.
 */
export type NavKind = 'POP' | 'PUSH' | 'REPLACE';
export type ScrollAction = 'restore' | 'hash' | 'top' | 'keep';

export interface LocationLike {
  pathname: string;
  search: string;
  hash: string;
}

/**
 * - Précédent / Suivant (POP) : restaurer la position enregistrée de cette entrée d'historique.
 * - Lien avec ancre (#section) : aller à l'élément.
 * - Même page, seuls les paramètres d'URL changent (filtres, onglets, tri) : ne pas bouger.
 * - Toute autre navigation (nouvelle route, ou clic sur le lien de la page courante) : haut de page.
 */
export function decideScroll(kind: NavKind, prev: LocationLike | null, next: LocationLike): ScrollAction {
  if (kind === 'POP') return 'restore';
  if (next.hash) return 'hash';
  if (prev && prev.pathname === next.pathname && prev.search !== next.search) return 'keep';
  return 'top';
}

/** Clé d'une entrée d'historique : `key` seul serait « default » pour la première entrée de chaque onglet. */
export function entryKey(loc: LocationLike & { key: string }): string {
  return `${loc.key}|${loc.pathname}${loc.search}`;
}

const STORAGE_KEY = 'agriflow:scroll-positions';
const MAX_ENTRIES = 60;

export type PositionMap = Record<string, number>;

export function readPositions(storage: Pick<Storage, 'getItem'> | null): PositionMap {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: PositionMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function writePositions(storage: Pick<Storage, 'setItem'> | null, positions: PositionMap): void {
  try {
    const keys = Object.keys(positions);
    const trimmed = keys.length > MAX_ENTRIES ? Object.fromEntries(keys.slice(-MAX_ENTRIES).map((k) => [k, positions[k]])) : positions;
    storage?.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* stockage indisponible (navigation privée, quota) : la restauration est un confort, jamais bloquante */
  }
}
