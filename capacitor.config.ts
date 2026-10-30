import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Configuration Capacitor d'AgriFlow RDC — UNE seule base de code : la même application React tourne sur le Web et dans les
 * applications Android / iOS (le build Vite `dist/` est embarqué dans l'application native).
 *
 * Règles :
 *  - AUCUN `server.url` : une URL de développement ou distante dans cette configuration serait embarquée dans l'application de
 *    production. Pour le développement avec rechargement à chaud, utiliser `npx cap run android --live-reload --host=<IP>` (voir docs/CAPACITOR-MOBILE.md),
 *    qui passe l'URL par la ligne de commande (`npx cap run android --live-reload --host=<IP>`) et ne modifie pas ce fichier.
 *  - AUCUN `server.allowNavigation` : toute navigation hors de l'application (CinetPay, sites externes) s'ouvre dans le navigateur
 *    système ou dans le navigateur intégré (plugin Browser), jamais dans la WebView qui contient l'application et sa session.
 *  - `appId` : identifiant PERMANENT une fois l'application publiée (Play Store / App Store). À valider avant la première publication.
 */
const config: CapacitorConfig = {
  appId: 'cd.agriflow.rdc',
  appName: 'AgriFlow RDC',
  webDir: 'dist',
  android: {
    // Android 15 impose l'affichage bord à bord : sans ajustement, le contenu passerait sous les barres système.
    adjustMarginsForEdgeToEdge: 'auto',
    allowMixedContent: false,
  },
};

export default config;
