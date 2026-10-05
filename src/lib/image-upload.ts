import { supabase } from '@/lib/supabase';

/** Bucket public créé par la migration auth_roles_rls_hardening (chemin : `{user_id}/...`). */
const BUCKET = 'product-images';

export const MAX_PRODUCT_PHOTOS = 6;
/** Fichier choisi par l'utilisateur (avant compression). */
export const MAX_INPUT_BYTES = 12 * 1024 * 1024;
/** Fichier envoyé (après compression) : 5 Mo, comme la limite du bucket Storage (migration 20261001090000). */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const ACCEPTED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
export const MIN_IMAGE_SIDE = 100;
/** Garde-fou mémoire : au-delà, le décodage peut saturer un téléphone d'entrée de gamme. */
export const MAX_IMAGE_PIXELS = 50_000_000;

/** Type réel d'après les premiers octets (le `file.type` fourni par le navigateur se falsifie facilement). */
export function sniffImageType(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  // WebP : « RIFF » .... « WEBP »
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return null;
}

export function fileExtension(name: string): string {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i + 1).toLowerCase();
}

/** Contrôles avant tout traitement : taille, MIME déclaré, extension, signature réelle. Retourne un message utilisateur ou `null`. */
export async function validateImageFile(file: File): Promise<string | null> {
  if (file.size === 0) return 'Ce fichier est vide.';
  if (file.size > MAX_INPUT_BYTES) return 'Image trop lourde (12 Mo maximum).';
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return 'Format non pris en charge (JPG, PNG ou WebP).';
  if (!ACCEPTED_IMAGE_EXTENSIONS.includes(fileExtension(file.name))) return 'Extension de fichier non prise en charge (JPG, PNG ou WebP).';
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const real = sniffImageType(head);
  if (!real) return 'Ce fichier n\'est pas une image valide.';
  if (real !== file.type) return 'Le contenu du fichier ne correspond pas à son format.';
  return null;
}

/** Dimensions acceptables (ni miniature, ni image démesurée). */
export function validateDimensions(width: number, height: number): string | null {
  if (width < MIN_IMAGE_SIDE || height < MIN_IMAGE_SIDE) return `Image trop petite (${MIN_IMAGE_SIDE} px minimum de chaque côté).`;
  if (width * height > MAX_IMAGE_PIXELS) return 'Image trop grande. Réduisez sa taille puis réessayez.';
  return null;
}

/** Redimensionne (côté max 1600 px) et recompresse en JPEG avant envoi : photos plus légères. */
export async function compressImage(file: File, maxSide = 1600, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error('Cette image ne peut pas être lue. Essayez une autre photo.'); });
  const dimensionError = validateDimensions(bitmap.width, bitmap.height);
  if (dimensionError) { bitmap.close?.(); throw new Error(dimensionError); }
  const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * ratio);
  const h = Math.round(bitmap.height * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Traitement de l\'image impossible sur cet appareil.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Compression impossible.'))), 'image/jpeg', quality);
  });
}

export interface UploadedPhoto {
  url: string;
  path: string;
}

export async function uploadProductImage(userId: string, file: File): Promise<UploadedPhoto> {
  const invalid = await validateImageFile(file);
  if (invalid) throw new Error(invalid);
  const blob = await compressImage(file);
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error('Image trop lourde après compression (5 Mo maximum).');
  const path = `${userId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

/** Suppression au mieux (échec silencieux : la photo n'est de toute façon plus référencée). */
export async function removeProductImage(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path]);
}

/** Bucket public `avatars` (chemin `{user_id}/...`, policies RLS : le propriétaire écrit dans son dossier). */
const AVATAR_BUCKET = 'avatars';

export async function uploadAvatar(userId: string, file: File): Promise<UploadedPhoto> {
  const invalid = await validateImageFile(file);
  if (invalid) throw new Error(invalid);
  const blob = await compressImage(file, 512, 0.85);
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error('Image trop lourde après compression (5 Mo maximum).');
  const path = `${userId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}
