import { isNativeApp } from './platform';

/** Seules les pages https sans identifiants sont ouvertes (l'URL vient du serveur, mais on ne l'ouvre jamais sans contrôle). */
export function isSafeCheckoutUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && !u.username && !u.password;
  } catch {
    return false;
  }
}

export interface OpenCheckoutOptions {
  url: string;
  /** Référence interne du paiement : sert uniquement à rouvrir la page de résultat (qui vérifie côté serveur). */
  reference: string;
  navigate: (to: string) => void;
}

/**
 * Ouvre la page de paiement hébergée par le prestataire.
 * - Web : comportement historique (la page courante est remplacée ; le retour se fait sur /payment/result/:reference).
 * - Application native : navigateur intégré (Custom Tabs / SFSafariViewController), JAMAIS la WebView de l'application
 *   (elle contient la session). À la fermeture, on affiche /payment/result/:reference : cette page VÉRIFIE le paiement auprès du
 *   serveur. La fermeture du navigateur n'est en aucun cas une preuve de paiement.
 * Retourne `false` si l'URL est refusée.
 */
export async function openCheckoutPage(opts: OpenCheckoutOptions): Promise<boolean> {
  if (!isSafeCheckoutUrl(opts.url)) return false;
  if (!isNativeApp()) {
    window.location.href = opts.url;
    return true;
  }
  const { Browser } = await import('@capacitor/browser');
  const target = `/payment/result/${encodeURIComponent(opts.reference)}`;
  const handle = await Browser.addListener('browserFinished', () => {
    void handle.remove();
    opts.navigate(target);
  });
  try {
    await Browser.open({ url: opts.url, presentationStyle: 'fullscreen' });
  } catch (err) {
    await handle.remove();
    throw err;
  }
  return true;
}
