import { isNativeApp } from './platform';

/**
 * Schéma de lien profond de l'application native (déclaré dans AndroidManifest.xml et Info.plist).
 * Valeur maîtrisée et documentée : toute autre valeur est rejetée.
 */
export const APP_URL_SCHEME = 'cd.agriflow.rdc';

/** Origine publique du site web : `https://domaine` sans chemin. Refuse tout ce qui n'est pas https (ou une valeur invalide). */
export function normalizePublicWebUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    return u.origin;
  } catch {
    return null;
  }
}

/**
 * Origine à utiliser dans les liens envoyés par e-mail (réinitialisation de mot de passe…).
 * - Web : l'origine du site.
 * - Application native : l'origine de la WebView est `https://localhost` / `capacitor://localhost`, inutilisable dans un e-mail ;
 *   on utilise l'URL publique du site (VITE_PUBLIC_WEB_URL). Absente → `null` : on ne fabrique pas un lien inutilisable.
 */
export function publicWebUrl(): string | null {
  if (!isNativeApp()) return typeof window === 'undefined' ? null : window.location.origin;
  return normalizePublicWebUrl(import.meta.env.VITE_PUBLIC_WEB_URL as string | undefined);
}

export function authRedirectUrl(path: string): string | null {
  const base = publicWebUrl();
  if (!base || !path.startsWith('/') || path.startsWith('//')) return null;
  return `${base}${path}`;
}

/** Pages internes qu'un lien profond peut ouvrir. Tout le reste est ignoré (aucune redirection non maîtrisée). */
const DEEP_LINK_ALLOWLIST: RegExp[] = [
  /^\/$/,
  /^\/login$/,
  /^\/notifications$/,
  /^\/marketplace(?:\/[0-9a-fA-F-]{36})?$/,
  /^\/orders\/[0-9a-fA-F-]{36}$/,
  /^\/(?:buyer|producer)\/orders$/,
  /^\/payment\/result\/[A-Za-z0-9._-]{6,80}$/,
];

/**
 * Convertit une URL reçue par l'application (lien profond) en chemin interne autorisé, ou `null`.
 * Acceptés : `cd.agriflow.rdc://payment/result/REF` et `https://<domaine public>/payment/result/REF`.
 * Jamais conservés : paramètres de requête et fragment (pas de jeton transporté par lien profond).
 */
export function resolveDeepLink(rawUrl: string, publicOrigin: string | null): string | null {
  let u: URL;
  try { u = new URL(rawUrl); } catch { return null; }
  if (u.username || u.password) return null;
  let path: string;
  if (u.protocol === `${APP_URL_SCHEME}:`) {
    path = `/${u.host}${u.pathname}`.replace(/\/{2,}/g, '/');
  } else if (u.protocol === 'https:' && publicOrigin !== null && u.origin === publicOrigin) {
    path = u.pathname;
  } else {
    return null;
  }
  if (path.length > 1) path = path.replace(/\/+$/, '');
  if (path.includes('..') || path.includes('\\') || /%2e|%2f|%5c/i.test(path)) return null;
  return DEEP_LINK_ALLOWLIST.some((re) => re.test(path)) ? path : null;
}
