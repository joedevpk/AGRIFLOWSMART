import { Capacitor } from '@capacitor/core';

export type AppPlatform = 'web' | 'android' | 'ios';

/** Vrai uniquement dans l'application Android / iOS (WebView Capacitor). Faux dans un navigateur et dans les tests. */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function appPlatform(): AppPlatform {
  const p = Capacitor.getPlatform();
  return p === 'android' || p === 'ios' ? p : 'web';
}
