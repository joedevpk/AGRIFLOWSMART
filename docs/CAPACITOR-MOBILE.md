# AgriFlow RDC — application mobile (Capacitor 7)

**Une seule base de code** : la même application React/Vite tourne sur le Web et dans des applications Android et iOS. Capacitor embarque le build `dist/`
dans une WebView native ; il n'y a ni deuxième application, ni serveur distant.

> **État honnête.** Les projets Android et iOS sont **générés et synchronisables** (vérifié). **Aucun APK ni IPA n'a été compilé** : l'environnement de travail n'avait
> ni SDK Android (téléchargements Google/Gradle bloqués), ni macOS/Xcode. Aucun test sur appareil n'a été réalisé. Les sections 11 et 12 distinguent précisément ce qui est
> vérifié de ce qui reste à faire.

## 1. Architecture

```
React + Vite ──► npm run build:mobile ──► dist/ ──► npx cap sync ──► android/  (Android Studio / Gradle)
      │                                                         └──► ios/      (Xcode, macOS uniquement)
      └─ src/lib/native/*  ponts vers les plugins, chargés à la demande ; sur le Web, comportement historique inchangé
```

- `capacitor.config.ts` : `appId cd.agriflow.rdc`, `appName AgriFlow RDC`, `webDir dist`. **Aucun `server.url`**, aucun `allowNavigation`, pas de clair (`cleartext`) : le build embarqué fait foi.
- Toute navigation hors de l'application (CinetPay, sites externes) s'ouvre dans le **navigateur intégré** ou le navigateur système, **jamais** dans la WebView qui contient la session.
- `BrowserRouter` est conservé : Capacitor sert `index.html` pour les routes sans extension.
- Détection de plateforme : `src/lib/native/platform.ts` (`isNativeApp()`), faux sur le Web et dans les tests.

## 2. Dépendances ajoutées (justifiées)

Versions : **Capacitor 7.6.9**, choisi parce que son CLI exige Node ≥ 20 (le projet est déployé sous Node 20 sur Render ; Capacitor 8 exigerait Node 22 et donc une modification du déploiement). Aucune version majeure existante n'a été modifiée.

| Paquet | Version | Utilité réelle dans AgriFlow |
|---|---|---|
| `@capacitor/core`, `@capacitor/android`, `@capacitor/ios` | ~7.6.9 | socle |
| `@capacitor/cli` (dev) | ~7.6.9 | `cap sync`, `cap open`, `cap run` |
| `@capacitor/app` | ~7.1.2 | bouton Retour Android, liens profonds |
| `@capacitor/browser` | ~7.0.5 | page de paiement CinetPay hors de la WebView |
| `@capacitor/camera` | ~7.0.5 | photo de produit / de profil (caméra ou galerie) |
| `@capacitor/geolocation` | ~7.1.8 | bouton « Ma position » de Ma Parcelle |
| `@capacitor/filesystem`, `@capacitor/share` | ~7.1.9 / ~7.0.4 | export CSV (admin) et copie des données personnelles : les liens `blob:` ne téléchargent rien dans une WebView |
| `@capacitor/assets` (dev) | 3.0.5 | génération des icônes et écrans de lancement |

**Non installés volontairement** : notifications push (voir §8), réseau (`navigator.onLine` suffit), clavier/barre d'état/écran de lancement (les valeurs par défaut conviennent), stockage sécurisé (§5), partage de produits (aucune fonction de partage n'existe dans l'application).

## 3. Fichiers créés ou modifiés

Créés : `capacitor.config.ts`, `android/`, `ios/`, `assets/` (sources d'icônes), `scripts/mobile-checks.mjs`, `src/lib/native/*` (platform, urls, browser, camera, geolocation, files, serviceWorker, lifecycle), `src/components/system/NativeBridge.tsx`, `src/pages/auth/ResetPasswordPage.tsx`, tests `src/test/native-*.test.ts`, `src/test/mobile-checks.test.ts`, ce document.
Modifiés : `package.json` (scripts, dépendances), `eslint.config.js` (ignore `android`, `ios`), `tsconfig.node.json`, `.env.example`, `src/vite-env.d.ts`, `src/App.tsx`, `src/main.tsx`, `src/lib/offline/precache.ts`, `src/pages/auth/ForgotPasswordPage.tsx`, `src/pages/CheckoutConfirmationPage.tsx`, `src/pages/OrderDetailPage.tsx`, `src/pages/ProfilePage.tsx`, `src/pages/dashboard/PublishProductPage.tsx`, `src/components/agri/PlotForm.tsx`, `src/components/account/PrivacySettings.tsx`, `src/components/admin/finance/FinanceTransactions.tsx`, `src/services/privacyService.ts`.

## 4. Configuration requise et variables d'environnement

Variables **publiques** du build (jamais de secret ; tout `VITE_*` est lisible dans l'application) :

| Variable | Rôle |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | clés publiques Supabase (la sécurité repose sur la RLS) |
| `VITE_PUBLIC_WEB_URL` | **obligatoire en mobile** : URL publique https du site, utilisée dans les liens des e-mails (l'origine de la WebView, `https://localhost`, est inutilisable) |

`npm run build:mobile` exécute `scripts/mobile-checks.mjs` : refuse une clé `service_role`, une URL locale/de test, un `VITE_*` au nom de secret, puis analyse `dist/` (aucun `SUPABASE_SERVICE_ROLE_KEY`, secret CinetPay, jeton service_role) et, après `cap sync`, la configuration native embarquée (aucun `server.url`, `cleartext`, `allowNavigation`). Les secrets CinetPay restent exclusivement dans les secrets Supabase (Edge Functions).

## 5. Commandes exactes

| But | Commande |
|---|---|
| Installer | `npm ci` |
| Web (développement) | `npm run dev` |
| Build web de production | `npm run build` |
| Build mobile + contrôles | `npm run build:mobile` (variables du §4 dans l'environnement) |
| Synchroniser les plateformes | `npm run cap:sync` |
| **Diagnostic des prérequis Android** (JDK 21, SDK, wrapper, synchronisation, variables) | `npm run android:doctor` — ne compile rien |
| Ouvrir Android Studio | `npm run cap:android` (si Studio n'est pas détecté : variable `CAPACITOR_ANDROID_STUDIO_PATH`, ou *File → Open* sur le dossier `android`) |
| Lancer sur appareil/émulateur Android | `npm run cap:run:android` |
| APK de test (debug) | `npm run android:debug` → `android/app/build/outputs/apk/debug/app-debug.apk` (le script n'annonce le fichier que s'il existe) |
| AAB de publication | `npm run android:bundle` (signature à configurer, §6) |
| Ouvrir Xcode (macOS) | `npm run cap:ios` |
| Rechargement à chaud (développement) | `npx cap run android --live-reload --host=<IP-de-votre-PC>` (ne modifie pas `capacitor.config.ts`) |
| Régénérer icônes/écrans | `npx capacitor-assets generate --android --ios --iconBackgroundColor '#163A24' --splashBackgroundColor '#163A24'` |
| Régénérer une plateforme | supprimer `android/` (ou `ios/`) puis `npx cap add android` (ou `ios`) — **réappliquer §6/§7 (permissions, lien profond)** |

**Stockage de session** : Supabase conserve la session dans le `localStorage` de la WebView, privé à l'application. L'application Android a `allowBackup=false` pour que la sauvegarde Google n'emporte pas la session. Sur iOS, le système peut exceptionnellement purger le stockage d'une WebView ; l'utilisateur devrait alors se reconnecter. Un stockage chiffré natif (Keychain/Keystore, plugin communautaire) est une évolution possible, non justifiée ici.

## 6. Android

Généré : `applicationId cd.agriflow.rdc`, `minSdk 23`, `compileSdk/targetSdk 35`, AGP 8.7.2, Gradle 8.11.1, **JDK 21 requis**. Icônes adaptatives et écrans de lancement à l'image d'AgriFlow (vert forêt, feuille).

Prérequis : Android Studio récent (Ladybug ou plus), SDK Platform 35, JDK 21 (fourni par Android Studio), émulateur ou téléphone avec débogage USB.

**Compiler** : `npm run cap:android` puis *Run* dans Android Studio, ou `npm run android:debug`. Les scripts `android:debug` et `android:bundle` passent par `scripts/android-tools.mjs`, qui choisit `gradlew.bat` (Windows) ou `./gradlew` (macOS/Linux), vérifie le JDK 21 et le SDK, utilise au besoin le JDK d'Android Studio et le SDK à son emplacement par défaut, puis explique tout échec. Un `.apk` n'existe qu'après cette compilation : ce dépôt n'en contient pas.

**Permissions déclarées** (`AndroidManifest.xml`) : `INTERNET`, `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION` (bouton « Ma position », ponctuel, jamais en arrière-plan). Photos : aucune permission (appareil photo du système et sélecteur de photos Android, plugin Camera sans enregistrement en galerie). `usesCleartextTraffic=false`, `allowBackup=false`.

**Publication** : créer un keystore de signature (à conserver hors du dépôt), configurer `signingConfigs` ou signer l'AAB dans Android Studio, `versionCode` à incrémenter à chaque envoi, fiche Play Store (politique de confidentialité, déclaration de la collecte de position).

## 6 bis. Windows : de zéro à l'APK de débogage

Les commandes `npm run …` s'exécutent avec `cmd.exe` quelle que soit la console (CMD ou PowerShell) ; elles sont identiques sous Windows, macOS et Linux.

**1. Installer** (une fois) : [Node.js 20 ou plus](https://nodejs.org), [Git](https://git-scm.com), [Android Studio](https://developer.android.com/studio). Au premier lancement d'Android Studio, laissez-le installer le SDK, puis *More Actions → SDK Manager* : dans **SDK Platforms** cochez « Android 15 (API 35) » ; dans **SDK Tools** cochez « Android SDK Build-Tools », « Android SDK Platform-Tools » (et « Android Emulator » pour tester sans téléphone) ; validez.
Android Studio fournit le **JDK 21** (JBR). Les variables ci-dessous sont recommandées ; `npm run android:doctor` retrouve de toute façon le JDK d'Android Studio et le SDK à leur emplacement par défaut.

```
:: CMD (ouvrir ensuite un NOUVEAU terminal)
setx ANDROID_HOME "%LOCALAPPDATA%\Android\Sdk"
setx JAVA_HOME "C:\Program Files\Android\Android Studio\jbr"
```
```
# PowerShell (ouvrir ensuite un NOUVEAU terminal)
setx ANDROID_HOME "$env:LOCALAPPDATA\Android\Sdk"
setx JAVA_HOME "C:\Program Files\Android\Android Studio\jbr"
```

**2. Placer le projet dans un dossier court** (ex. `C:\agriflow`) : Windows limite les chemins à environ 260 caractères et Gradle produit des chemins longs.

**3. Installer les dépendances** : `npm ci`

**4. Créer `.env.production`** à la racine du projet (fichier ignoré par Git, jamais à publier). Aucune variable n'a besoin d'être « exportée » : Vite et les contrôles lisent ce fichier.
```
# PowerShell
@"
VITE_SUPABASE_URL=https://<votre-projet>.supabase.co
VITE_SUPABASE_ANON_KEY=<clé anon PUBLIQUE de Supabase>
VITE_PUBLIC_WEB_URL=https://<votre-domaine-public>
"@ | Set-Content -Encoding ascii .env.production
```
(CMD : `notepad .env.production`, collez les trois lignes, enregistrez.) La clé `service_role` ne doit **jamais** figurer ici : le build la refuse.

**5. Vérifier les prérequis** : `npm run android:doctor`. Chaque ligne `✖` indique quoi corriger ; `⚠` est un avertissement. Le diagnostic ne compile rien.

**6. Ouvrir Android Studio** : `npm run cap:android` (construit le site, synchronise, ouvre le projet). Si Android Studio ne s'ouvre pas : `setx CAPACITOR_ANDROID_STUDIO_PATH "C:\Program Files\Android\Android Studio\bin\studio64.exe"` (nouveau terminal), ou ouvrez le dossier `android` avec *File → Open*. Laissez Android Studio finir la synchronisation Gradle (barre de progression en bas).

**7. Générer l'APK de débogage**
- Depuis Android Studio : *Build → Build Bundle(s) / APK(s) → Build APK(s)*, puis le lien « locate » de la notification ; ou
- en ligne de commande : `npm run android:debug`.

Le premier build télécharge Gradle 8.11.1 (environ 200 Mo) puis les dépendances Android : plusieurs minutes et accès Internet nécessaires. Le fichier attendu est `android\app\build\outputs\apk\debug\app-debug.apk` ; la commande ne l'annonce que s'il existe.

**8. Installer sur un téléphone** : activer *Options pour les développeurs → Débogage USB*, brancher le téléphone, accepter l'autorisation, puis `%ANDROID_HOME%\platform-tools\adb install -r android\app\build\outputs\apk\debug\app-debug.apk` ; ou directement `npm run cap:run:android` (choix de l'appareil ou de l'émulateur).

**Si une étape échoue** : relancer `npm run android:doctor` ; voir aussi le tableau de dépannage en fin de document.

## 7. iOS

Généré (modèle Capacitor) : Bundle Identifier `cd.agriflow.rdc`, cible minimale **iOS 14.0**, nom affiché « AgriFlow RDC », icônes et écrans de lancement. Les pods n'ont **pas** été installés (CocoaPods absent).

**Sous Windows ou Linux** : la compilation, la signature et les tests iOS sont **impossibles** ; ils exigent macOS et Xcode (Xcode 16 recommandé pour Capacitor 7, CocoaPods installé). Sur un Mac : `npm ci`, `npm run cap:ios` (exécute `cap sync`, `pod install`, ouvre Xcode).

À faire dans Xcode : choisir l'équipe de développement (compte Apple Developer, 99 USD/an), laisser la signature automatique pour les tests, tester sur simulateur puis sur appareil, archiver pour TestFlight/App Store. Exigences de publication : politique de confidentialité, fiche de confidentialité de l'application (position, photos), déclaration de chiffrement à l'export (`ITSAppUsesNonExemptEncryption` : non défini volontairement, décision juridique à prendre).

**Permissions** (`Info.plist`, textes en français) : `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSLocationWhenInUseUsageDescription` (jamais « Always »).

## 8. Fonctions natives retenues

| Fonction | Implémentation | État |
|---|---|---|
| Photos produit/profil | `pickPhotoFiles()` (Camera) → mêmes validation et téléversement qu'au Web | code testé avec plugins simulés ; **non testé sur appareil** |
| Position de parcelle | `getCurrentCoordinates()` ; permission demandée au clic ; erreurs expliquées | idem |
| Paiement | `openCheckoutPage()` : navigateur intégré, retour sur `/payment/result/:reference` | idem (voir §9) |
| Exports (CSV, données personnelles) | `downloadTextFile()` : cache privé → feuille de partage → suppression | idem |
| Bouton Retour Android, liens profonds | `NativeBridge` | logique testée ; **non testé sur appareil** |
| Notifications push | **Non implémentées.** Les notifications de l'application sont celles de la base (affichées dans l'application) | à faire : compte Firebase (FCM) + clé APNs Apple, plugin `@capacitor/push-notifications`, table de jetons d'appareil, Edge Function d'envoi, consentement |
| Hors ligne | **Hors périmètre.** Les fichiers de l'application sont embarqués ; les données (produits, commandes) exigent le réseau | une vraie stratégie de synchronisation reste à concevoir |
| Partage de produits | Aucune fonction de partage dans l'application | à spécifier |

**Service Worker / PWA** : le Service Worker du site est conservé sur le Web. Dans l'application native il n'est **pas** enregistré (les fichiers sont embarqués ; un cache de coquille persisterait entre deux versions de l'application et pourrait servir une version périmée) ; tout Service Worker ou cache `agriflow-shell-*` existant est supprimé. La « préparation hors connexion » est masquée en natif.

## 9. Authentification et paiements

**Authentification** (Supabase, session persistante et renouvelée par le client existant) :
- **Défaut corrigé** : la page « mot de passe oublié » envoyait un lien vers `/login` et **aucune page ne permettait de saisir le nouveau mot de passe** (la récupération n'aboutissait pas, y compris sur le Web). Page `/reset-password` ajoutée (8 caractères minimum, confirmation, déconnexion puis reconnexion).
- Les liens des e-mails pointent vers `VITE_PUBLIC_WEB_URL` (dans l'application, `window.location.origin` aurait donné `https://localhost`). Sans cette variable, l'application n'envoie pas de lien cassé et le dit.
- Les liens de confirmation d'inscription utilisent le « Site URL » de Supabase (configuration du tableau de bord) : ils s'ouvrent dans le navigateur ; l'utilisateur confirme sur le site puis se connecte dans l'application.
- **Action manuelle Supabase** : Authentication → URL Configuration → ajouter `https://<votre-domaine>/reset-password` aux *Redirect URLs*.
- **Liens profonds** : schéma `cd.agriflow.rdc://` (déclaré dans le manifeste Android et `Info.plist`), uniquement vers des pages d'une liste blanche (accueil, connexion, marketplace, fiche produit, commande, notifications, résultat de paiement). Requêtes, fragments et jetons ne sont jamais transportés. Les liens https (**App Links / Universal Links**) exigent un domaine vérifié (`assetlinks.json`, `apple-app-site-association`) : non configurés.
- OAuth : non utilisé par l'application.

**Paiement CinetPay** : aucune modification de la vérification serveur ni des clés. En natif, la page de paiement s'ouvre dans le navigateur intégré ; à sa fermeture l'application affiche `/payment/result/:reference`, qui **vérifie le paiement côté serveur**. Fermer le navigateur ou revenir dans l'application n'est jamais une preuve de paiement. Limite connue : l'adresse de retour de CinetPay étant une page https du site, le navigateur intégré peut y afficher une demande de connexion (il ne partage pas la session de l'application) ; l'utilisateur ferme simplement le navigateur. Des App Links supprimeraient ce détour. Le paiement en ligne reste désactivé tant que `PAYMENTS_ONLINE_ENABLED` n'est pas activé (voir `docs/CINETPAY-INTEGRATION.md`).

## 10. Sécurité spécifique à l'application hybride

Aucune clé secrète ni `service_role` dans le bundle (contrôle automatique, §4) ; RLS inchangée ; permissions minimales ; aucune URL de développement dans la configuration native (contrôle automatique) ; sauvegarde Android désactivée ; liens profonds en liste blanche ; ouverture de pages de paiement limitée à https sans identifiants ; fichiers exportés écrits uniquement dans le cache privé, noms nettoyés, supprimés après partage ; aucun suivi de position en arrière-plan.

## 11. Tests réalisés

| Contrôle | Résultat |
|---|---|
| `npm run typecheck`, `typecheck:edge`, `npm run lint`, `tsc -p tsconfig.node.json` | voir le rapport final |
| `npm test` (Vitest) | voir le rapport final ; nouveaux : URL et liens profonds, ponts natifs (plugins simulés), contrôles du build mobile |
| `npm run cap:sync` (avec valeurs factices https) | build, analyse du bundle et de la configuration native : OK ; plugins enregistrés côté Android |
| Version web dans Chromium | réinitialisation du mot de passe (lien invalide, validations, succès), lien de récupération vers le site public : OK |
| Compilation Android, lancement sur émulateur/appareil, iOS | **non exécutés** (§ état honnête) |

## 12. Limites et étapes restantes

1. **Compiler Android** sur une machine avec Android Studio, tester sur téléphone : connexion, déconnexion, restauration de session au redémarrage, photos (caméra et galerie), position (autorisation puis refus), commande, paiement (quand CinetPay sera activé), bouton Retour, rotation, clavier, mode sans réseau.
2. **iOS** : sur Mac, `pod install`, signature, simulateur puis appareil ; textes d'autorisation à valider.
3. Configurer Supabase (Redirect URLs, §9) et décider du domaine pour les App Links / Universal Links.
4. Notifications push, hors ligne avancé, stockage chiffré de session : non réalisés (§5, §8).
5. Valider l'`appId` `cd.agriflow.rdc` **avant la première publication** (il est permanent).
6. Le champ `UIRequiredDeviceCapabilities` du modèle iOS contient `armv7` (valeur par défaut de Capacitor 7) ; à revoir avec Xcode.
7. Panneau d'administration : l'export CSV passe par la feuille de partage ; à vérifier sur appareil.

## Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| `build:mobile` refuse de démarrer | variable manquante ou factice | corriger la variable citée (§4) |
| Page blanche dans l'application | `dist/` non synchronisé | `npm run cap:sync` |
| `SDK location not found` | pas de SDK Android | installer le SDK ; `android/local.properties` : `sdk.dir=…` |
| `Unsupported class file major version` | JDK ≠ 21 | utiliser le JDK d'Android Studio |
| Lien d'e-mail vers `localhost` | `VITE_PUBLIC_WEB_URL` absente | la définir, reconstruire |
| `pod install` échoue | CocoaPods absent / pas de macOS | installer CocoaPods sur macOS |
| `'.' n'est pas reconnu` / `./gradlew` introuvable (Windows) | ancienne commande `cd android && ./gradlew` | utiliser `npm run android:debug` (appelle `gradlew.bat`) |
| `build:mobile` refuse alors que `.env.production` existe | fichier mal nommé, encodage UTF-16, ou valeur factice | nom exact `.env.production`, enregistrer en ASCII/UTF-8 (cf. §6 bis) |
| `Downloading … gradle-8.11.1-all.zip` puis `UnknownHostException` | pas d'accès à services.gradle.org (réseau, proxy) | autoriser l'accès ou configurer le proxy dans `%USERPROFILE%\.gradle\gradle.properties` |
| `License for package Android SDK … not accepted` | licences du SDK non acceptées | `%ANDROID_HOME%\cmdline-tools\latest\bin\sdkmanager --licenses` ou SDK Manager |
| `The system cannot find the path specified` / chemin trop long | projet dans un dossier profond | déplacer le projet vers `C:\agriflow` |
| Ancienne version affichée sur le Web | cache du Service Worker | rechargement forcé ; en natif le Service Worker est désactivé |
