import { isNativeApp } from './platform';

export class NativePermissionError extends Error {
  constructor(message: string) { super(message); this.name = 'NativePermissionError'; }
}

/**
 * Photo depuis l'appareil photo ou la galerie (application native uniquement). Sur le Web, les pages gardent leur champ
 * <input type="file">. Retourne un tableau vide si l'utilisateur annule. Le fichier passe ensuite par la MÊME validation
 * (type, taille) et le MÊME téléversement que sur le Web.
 */
export async function pickPhotoFiles(): Promise<File[]> {
  if (!isNativeApp()) return [];
  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
  try {
    const photo = await Camera.getPhoto({
      source: CameraSource.Prompt, resultType: CameraResultType.Uri, quality: 85, correctOrientation: true,
      promptLabelHeader: 'Ajouter une photo', promptLabelPhoto: 'Choisir dans la galerie', promptLabelPicture: 'Prendre une photo', promptLabelCancel: 'Annuler',
    });
    if (!photo.webPath) return [];
    const blob = await (await fetch(photo.webPath)).blob();
    const ext = photo.format === 'jpg' ? 'jpeg' : photo.format;
    const type = blob.type || `image/${ext}`;
    return [new File([blob], `photo-${Date.now()}.${photo.format === 'jpeg' ? 'jpg' : photo.format}`, { type })];
  } catch (err) {
    const msg = String((err as { message?: unknown })?.message ?? err).toLowerCase();
    if (msg.includes('cancel')) return [];
    if (msg.includes('denied') || msg.includes('permission')) {
      throw new NativePermissionError('L\'accès à l\'appareil photo ou aux photos est refusé. Autorisez-le dans les réglages de votre téléphone.');
    }
    throw err;
  }
}
