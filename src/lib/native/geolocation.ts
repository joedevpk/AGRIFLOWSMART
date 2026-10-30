import { isNativeApp } from './platform';

export type GeoErrorCode = 'unavailable' | 'denied' | 'timeout' | 'failed';
export class GeoError extends Error {
  constructor(public readonly code: GeoErrorCode, message: string) { super(message); this.name = 'GeoError'; }
}
export interface Coordinates { latitude: number; longitude: number }

const OPTIONS = { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 };

/**
 * Position ponctuelle (jamais de suivi en continu ni en arrière-plan). L'autorisation n'est demandée qu'à l'appel, c'est-à-dire
 * quand l'utilisateur appuie sur « Utiliser ma position ».
 */
export async function getCurrentCoordinates(): Promise<Coordinates> {
  if (isNativeApp()) {
    const { Geolocation } = await import('@capacitor/geolocation');
    try {
      let perm = await Geolocation.checkPermissions();
      if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') perm = await Geolocation.requestPermissions({ permissions: ['location'] });
      if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') throw new GeoError('denied', 'Autorisation de localisation refusée.');
      const pos = await Geolocation.getCurrentPosition(OPTIONS);
      return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    } catch (err) {
      if (err instanceof GeoError) throw err;
      const msg = String((err as { message?: unknown })?.message ?? err).toLowerCase();
      if (msg.includes('denied') || msg.includes('permission')) throw new GeoError('denied', 'Autorisation de localisation refusée.');
      if (msg.includes('timeout') || msg.includes('timed out')) throw new GeoError('timeout', 'Délai dépassé.');
      if (msg.includes('not enabled') || msg.includes('disabled') || msg.includes('unavailable')) throw new GeoError('unavailable', 'Localisation indisponible.');
      throw new GeoError('failed', 'Position introuvable.');
    }
  }
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) throw new GeoError('unavailable', 'Localisation indisponible.');
  return new Promise<Coordinates>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (e) => reject(e.code === 1 ? new GeoError('denied', 'Autorisation de localisation refusée.') : e.code === 3 ? new GeoError('timeout', 'Délai dépassé.') : new GeoError('unavailable', 'Position introuvable.')),
      OPTIONS,
    );
  });
}
