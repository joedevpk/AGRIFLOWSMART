import { isNativeApp } from './platform';

export interface DownloadOptions {
  filename: string;
  mimeType: string;
  content: string;
  /** Titre de la feuille de partage native. */
  shareTitle?: string;
}

/** Nom de fichier sûr : jamais de séparateur de chemin ni de caractère spécial. */
export function safeFilename(name: string): string {
  // Caractères sûrs uniquement, aucune suite de points (`..`) et aucun point/souligné en tête.
  const cleaned = name.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/\.{2,}/g, '_').replace(/^[._]+/, '').slice(0, 100);
  return cleaned || 'fichier';
}

/**
 * Enregistre/partage un fichier texte généré dans l'application (export CSV, export de données personnelles).
 * - Web : téléchargement par lien temporaire (comportement historique).
 * - Application native : les liens `blob:` ne déclenchent aucun téléchargement dans une WebView ; le fichier est écrit dans le
 *   cache privé de l'application puis proposé via la feuille de partage du système (enregistrer, envoyer…), puis supprimé du cache.
 */
export async function downloadTextFile(opts: DownloadOptions): Promise<void> {
  const filename = safeFilename(opts.filename);
  if (!isNativeApp()) {
    const blob = new Blob([opts.content], { type: opts.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    return;
  }
  const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
  const path = `exports/${Date.now()}-${filename}`;
  const written = await Filesystem.writeFile({ path, data: opts.content, directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true });
  try {
    await Share.share({ title: opts.shareTitle ?? filename, url: written.uri, dialogTitle: 'Enregistrer ou partager le fichier' });
  } catch (err) {
    // L'utilisateur ferme la feuille de partage : ce n'est pas une erreur.
    if (!String((err as { message?: unknown })?.message ?? err).toLowerCase().includes('cancel')) throw err;
  } finally {
    await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => undefined);
  }
}
