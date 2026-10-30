import { resolveDeepLink } from './urls';

/**
 * Logique pure des événements natifs (testable sans appareil).
 * Bouton Retour Android : si l'historique de l'application contient une page précédente, on y retourne ; sinon on ferme l'application.
 */
export function createBackButtonHandler(deps: { historyIndex: () => number; goBack: () => void; exitApp: () => void }): () => void {
  return () => {
    if (deps.historyIndex() > 0) deps.goBack();
    else deps.exitApp();
  };
}

/** Lien profond reçu : n'ouvre que les pages de la liste blanche, ignore tout le reste (aucune redirection non maîtrisée). */
export function createDeepLinkHandler(deps: { navigate: (path: string) => void; publicOrigin: () => string | null }): (url: string) => boolean {
  return (url) => {
    const path = resolveDeepLink(url, deps.publicOrigin());
    if (!path) return false;
    deps.navigate(path);
    return true;
  };
}
