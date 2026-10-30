# Refonte : identité visuelle, page d'accueil, créateur du projet

Toutes les fonctionnalités existantes sont conservées (aucune page, route, table ni intégration supprimée). Inventaire généré depuis le code : `docs/INVENTAIRE-FONCTIONNALITES.md` (53 routes, 51 pages, 11 services, 6 fonctions Edge, 15 migrations).

## 1. Logo AgriFlow RDC
- **Concept** : une feuille (production locale) sur une courbe qui file vers un point (circulation des produits du producteur vers le marché) ; petite étoile dorée, clin d'œil discret à la RDC. Palette inchangée (vert forêt `#163A24`, vert agricole, orange récolte).
- **Source unique** : `src/components/brand/mark.json`. Génération : `node scripts/build-brand.mjs` (texte converti en tracés, police Manrope).
- **Fichiers** (`public/brand/`) : `agriflow-logo.svg` (principal), `agriflow-logo-dark.svg` (fond sombre), `agriflow-logo-tagline.svg` (avec « Du producteur au marché, simplement. »), `agriflow-logo-mono.svg` (monochrome), `agriflow-mark.svg` (compact, carré), `agriflow-mark-glyph.svg`, `agriflow-mark-mono.svg`, PNG (`*-512`, `*-1200`), `og-image.png` (1200×630), `public/favicon.svg`, `favicon-32.png`, `apple-touch-icon.png`.
- **Android / iOS** : sources `assets/icon-only.png`, `icon-foreground.png`, `icon-background.png`, `splash*.png` → `npx capacitor-assets generate …` (déjà exécuté : icônes adaptatives et écrans de lancement dans `android/` et `ios/`). L'identifiant `cd.agriflow.rdc` est inchangé.
- **Remplacements** : composant `BrandLogo` (`src/components/brand/BrandLogo.tsx`) utilisé en-tête (`HomeHeader`), pied de page (`Header.tsx`), connexion mobile et bureau (`AuthLayout`), tableau de bord (`DashboardLayout`) ; favicon (`index.html`).
- **Non modifié volontairement** : `og:image` de `index.html` (photo distante déjà en place) — une image de marque prête est disponible (`public/brand/og-image.png`) ; les robots de partage exigent une URL absolue, à renseigner avec votre domaine.

## 2. Page d'accueil (sans donnée inventée)
- **Offres récentes** (`LatestOffers`) : lues dans la base avec la même requête et la même carte que la marketplace ; états chargement, erreur et vide explicite ; défilement horizontal sur téléphone, grille dès la tablette.
- **Bandeau d'accès rapide** (`WelcomeStrip`) : visible seulement pour un utilisateur connecté, liens selon son rôle réel (producteur, coopérative, acheteur, administrateur).
- **Textes corrigés** : le site annonçait « Paiement sécurisé via CinetPay » / « Mobile Money, carte » alors que le paiement en ligne n'est pas encore activé. Désormais : « Paiement à la livraison ; paiement en ligne bientôt » (FAQ, Comment ça marche, accueil, pied de page). **Kikongo et Tshiluba** : texte français provisoire (`TODO traduction`) ; **Lingala et Swahili** : traductions courtes à faire relire.

## 3. Créateur du projet
- Page **`/a-propos`** (nouvelle ; le lien « À propos d'AgriFlow » du pied de page pointait par erreur vers « Comment ça marche »).
- **Photo** : `public/images/createur/createur-agriflow.webp` et `.jpg` (440×550, recadrage seul, sans retouche ni déformation) ; original conservé hors site : `assets/source/createur-original.jpg`.
- **Textes** : `src/lib/founder.ts` (seul endroit à modifier : nom, fonction, biographie, liens professionnels — aucun lien ni biographie inventés).
- **Nom « Joël Piako »** : repris de votre mission ; il n'apparaît nulle part ailleurs dans le projet. **Confirmez l'orthographe** (une seule constante à corriger).

## 4. Limites
- Les images d'en-tête des pages (PageHero) et du hero sont des photos distantes déjà présentes avant ce travail ; non remplacées.
- Harmonisation visuelle page par page : non réécrite (les passes précédentes l'avaient déjà traitée) ; aucune réécriture globale pour ne pas bousculer les habitudes.
- Application Android : projet synchronisé, **aucun APK compilé** ni test sur appareil (voir `docs/CAPACITOR-MOBILE.md`, procédure Windows §6 bis).
- Paiement en ligne CinetPay : toujours désactivé tant que les clés et `PAYMENTS_ONLINE_ENABLED` ne sont pas fournis (`docs/CINETPAY-INTEGRATION.md`).
