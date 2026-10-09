/**
 * Où afficher la navigation basse mobile.
 *
 * - Écrans d'authentification et administration : jamais (préfixes).
 * - /checkout : jamais. L'étape en cours y expose sa propre barre d'action fixe (Continuer / Confirmer) ;
 *   la navigation basse, plus haute dans l'empilement, la recouvrait et rendait ces boutons inaccessibles.
 *   Correspondance EXACTE : /checkout/confirmation/… garde la navigation.
 */
export const NO_BOTTOM_NAV_PREFIXES = ['/login', '/register', '/forgot-password', '/admin'] as const;
export const NO_BOTTOM_NAV_EXACT = ['/checkout'] as const;

export function hasBottomNav(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if ((NO_BOTTOM_NAV_EXACT as readonly string[]).includes(path)) return false;
  return !NO_BOTTOM_NAV_PREFIXES.some((p) => path.startsWith(p));
}
