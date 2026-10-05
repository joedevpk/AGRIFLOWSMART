/**
 * Stockage local versionné (localStorage), tolérant aux erreurs (navigation privée, quota plein).
 * Toutes les clés sont préfixées et rangées par utilisateur pour ne jamais mélanger des données privées.
 */
const PREFIX = 'agriflow:v1:';

export function storageKey(userId: string, name: string): string {
  return `${PREFIX}${userId}:${name}`;
}

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/** Retourne false si l'écriture échoue (l'appelant peut prévenir l'utilisateur). */
export function writeJSON(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string): void {
  try { localStorage.removeItem(key); } catch { /* ignoré */ }
}

export interface Cached<T> { data: T; savedAt: string }

export function cacheRead<T>(key: string): Cached<T> | null {
  return readJSON<Cached<T> | null>(key, null);
}

export function cacheWrite<T>(key: string, data: T): void {
  writeJSON(key, { data, savedAt: new Date().toISOString() } satisfies Cached<T>);
}
