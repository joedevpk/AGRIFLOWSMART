# Rapport — correction du responsive mobile (checkout, navigation, modales)

Branche de travail : `fix/mobile-responsive-checkout` (non poussée, rien déployé, aucun secret ni migration touché).

## Ce qui n'a PAS pu être exécuté (environnement sans réseau ni dépendances npm)
`npm ci` impossible : ni `typecheck` complet, ni `eslint`, ni `vitest`, ni `vite build`, ni Playwright n'ont été lancés.
Seuls contrôles réalisés : analyse syntaxique TypeScript/TSX des 14 fichiers modifiés (0 erreur) et exécution manuelle de la
logique de `hasBottomNav` (11/11 cas). Aucun test sur appareil réel, aucun achat de test, aucun test CinetPay.
**À lancer chez vous avant tout déploiement :** `npm ci && npm run check` puis `npm run test:e2e`.

## Bugs confirmés (par lecture du code) et correctifs
1. **Checkout inutilisable sur téléphone** — la navigation basse (`z-40`, fixe en bas) recouvrait la barre d'action du checkout (`z-30`),
   alors que les boutons en ligne « Continuer / Confirmer » sont masqués sous 1024 px (`max-lg:hidden`).
   → `/checkout` (correspondance exacte) n'affiche plus la nav basse ; la confirmation de commande la garde. Règle extraite dans `src/lib/bottom-nav.ts` (testée).
2. **`env(safe-area-inset-*)` valait 0 sur iPhone** — `viewport-fit=cover` absent de `index.html`. Ajouté.
3. **Barres fixes mal alignées sur la nav basse** (panier, fiche produit, bouton « Aperçu » de publication) — `bottom-16` en dur, ignorait la zone sûre iOS
   et laissait un vide entre 768 et 1024 px. → variable `--bottom-nav-h` + utilitaires `.bottom-above-nav` / `.pb-nav`; hauteur de la nav fixée à 3,5 rem.
4. **Panier mobile sans récapitulatif** (sous-total / livraison) — le bloc n'existait que ≥ 1024 px. Ajouté sous la liste (même composant `PriceSummary`).
5. **Zoom automatique iOS** dans les champs (police 14 px). → 16 px minimum sur écrans tactiles (`pointer: coarse`).
6. **Toast** recouvrant la nav / le bouton d'action et pouvant sortir de l'écran à 320 px. → positionné au-dessus de la nav, largeur bornée, bouton de fermeture 44 px.
7. **Hauteurs en `vh`** (messagerie, feuilles de filtres, aperçu produit, modale de contact) : « Voir les résultats » ou le champ de message pouvaient sortir de l'écran
   avec la barre d'adresse/clavier iOS. → `dvh` avec repli `vh`, modale de contact défilable.
8. **Messagerie** : bouton retour « ← » minuscule et sans libellé, bulles pouvant déborder, bouton d'envoi sans nom accessible. Corrigés.
9. **Navigation tablette (768–1279 px)** : ni nav basse ni menu compte → profil, commandes, messages, paiements, livraisons inaccessibles pour un connecté.
   → section « Mon espace » ajoutée dans le tiroir de l'en-tête.
10. **Administrateur sans aucun lien vers `/admin`** (ni desktop ni mobile). → entrée « Administration » dans la navigation du tableau de bord pour le rôle `admin`
    (la protection reste la RLS / `AdminRoute`, inchangée).
11. Cibles tactiles : boutons `sm` à 44 px sur écrans tactiles ; boutons de fermeture des modales à 44 px.

## Fichiers modifiés
index.html · src/index.css · src/App.tsx · src/lib/bottom-nav.ts (+ `.test.ts`, nouveaux) · src/components/layout/{BottomNav,HomeHeader,dashboard-nav}.tsx ·
src/components/ui/{Toast.tsx,button-styles.ts} · src/components/marketplace/{ContactProducer,MarketplaceFilters}.tsx ·
src/pages/{CartPage,MessagesPage,ProductDetailPage}.tsx · src/pages/dashboard/PublishProductPage.tsx

## Non modifié volontairement
Logique de commande, paiement, CinetPay, idempotence, vérification serveur, CORS, Edge Functions, schéma/migrations, RLS, statuts.
Aucune fonctionnalité retirée, aucun `display:none` global, aucun `overflow-x:hidden` global.

## Constats non corrigés / à vérifier
- La bannière de cookies (fixe, `z-60`) recouvre brièvement la nav et les barres d'action tant que le visiteur n'a pas choisi (comportement voulu, non modal).
- Tableaux (admin, commandes, produits, calendrier) : défilement horizontal interne au conteneur (pas de débordement de page) ; cartes mobiles déjà présentes pour commandes et produits.
- Capacitor : aucune configuration dans le dépôt, donc aucun test WebView applicable.
- Non audités en profondeur : AgriGuide, Ma Parcelle (carte), calendrier, ProducerRequests, AdminPage (formulaires), pages légales.

## À tester sur vrais appareils (Android Chrome, iPhone Safari)
Parcours panier → livraison → paiement → confirmation à 320/360/375/390/430 px ; clavier virtuel sur l'étape livraison ; barre d'adresse iOS ;
tiroir de menu ; messagerie ; filtres marketplace ; bascule paysage sur iPhone à encoche.

---

# Section 14 — Navigation et position de défilement (page ouverte au niveau du footer)

## Cause réelle
- Le défilement du site est celui de `window` (aucun conteneur interne ne porte les pages ; les seuls `overflow-y-auto` sont des tiroirs, la liste de messages et le sommaire).
- L'application utilise `BrowserRouter` (mode déclaratif de React Router 7) : `<ScrollRestoration>` n'y est pas disponible et **aucun** code ne remettait la page en haut.
  Un `<Link>` conserve donc la position de la page précédente → la page suivante s'ouvre « en bas » si elle est assez haute (ou clampée au footer si elle est plus courte).
- Pages chargées à la demande (`lazy` + `Suspense`) : la restauration native du navigateur s'applique avant que le contenu existe.
- Un seul cas était géré localement (`LegalLayout`), et son `scrollTo(0,0)` à chaque montage aurait écrasé une restauration Précédent.
- Checkout : changement d'étape avec `scrollTo` lancé avant le rendu de l'étape suivante, plus courte.

## Mécanisme central
- `src/components/system/ScrollManager.tsx`, monté une fois dans `AppShell` (dans le routeur), règles pures dans `src/lib/scroll-restoration.ts`.
- Nouvelle route (PUSH/REPLACE vers un autre chemin, ou clic sur le lien de la page courante) → haut de page.
- Même chemin, seuls les paramètres d'URL changent (filtres, onglets, tri) → position conservée.
- Précédent/Suivant (POP) → position de l'entrée d'historique restaurée (mémorisée par entrée, `sessionStorage`), en attendant que le contenu soit assez haut (2 s max) ; abandonnée dès que l'utilisateur touche/molette/clavier.
- Ancre `#section` → défilement vers l'élément dès qu'il existe (repli : haut de page) ; `scroll-padding-top` pour l'en-tête collant.
- `history.scrollRestoration = 'manual'` pendant que l'application est montée (restauré au démontage).
- Le panier n'est pas concerné : il vit dans son contexte/stockage, pas dans la position de défilement.
- Retraits de conflits : effet `scrollTo` de `LegalLayout` supprimé ; checkout : retour en haut dans un `useEffect` sur l'étape (après rendu), sans animation.
- Conservés tels quels (volontaires, après le défilement central) : `scrollIntoView` du bloc d'achat produit (`?order`), de l'historique de messages et du bloc confidentialité du profil.

## Tests réellement exécutés
- Analyse syntaxique TypeScript des 6 fichiers modifiés : 0 erreur.
- Logique pure (`decideScroll`, stockage des positions) exécutée à la main sous Node : 6/6 cas de décision + plafond à 60 entrées + contenu corrompu ignoré.
- `src/lib/scroll-restoration.test.ts` écrit (Vitest) mais **non exécuté** (dépendances indisponibles). `npm test` à lancer.
- **Non testés** (aucun navigateur ni appareil ici) : les 8 scénarios D (accueil→marketplace, produit, checkout, étapes panier/livraison/paiement, commandes/profil, Précédent/Suivant, ancres, mobile/desktop avec barres fixes).
  Ils sont à rejouer à la main sur ordinateur, Android et iPhone ; un test Playwright serait un bon ajout dans `tests/e2e`.

---

# Section 15 — Cœur de favoris

## Audit de l'existant (système réutilisé)
Table `favorites` (UNIQUE(user_id, product_id), RLS propriétaire) et `favoritesService` conservés tels quels : aucun changement de schéma.

Défauts constatés :
1. **Cœur de carte imbriqué dans le `<Link>` de l'image** : un appui sur le cœur pouvait ouvrir la fiche produit (bouton dans un lien, aucun `preventDefault`/`stopPropagation`).
2. **État dupliqué** : chaque page (marketplace, favoris, fiche produit) avait son propre état ; la fiche produit refaisait sa propre requête ; les cartes « produits similaires » et du profil producteur n'avaient pas de cœur.
3. Trois implémentations différentes du cœur (carte, fiche produit, page favoris) ; pas d'animation ; nom accessible redondant avec `aria-pressed`.
4. Fiche produit : cœur absent quand l'offre n'était pas commandable (producteur indisponible, rupture).
5. Page « Mes favoris » : nouvelle requête à chaque retrait.
6. Lien « Favoris » absent du menu producteur et du tiroir hors acheteurs, alors que le cœur est proposé à tous.

## Changements
- `FavoritesProvider` (`src/contexts/FavoritesContext.tsx`, dans le routeur) : **état unique** partagé par toutes les vues, un chargement par compte, réponses obsolètes ignorées, bascule optimiste avec retour à l'état précédent + message si l'écriture échoue (y compris erreur réseau), un seul appel par produit à la fois (clics rapides sans requêtes contradictoires ni doublons ; l'UNIQUE en base reste le filet de sécurité).
  Non connecté : message + redirection vers la connexion (retour sur la page d'origine), **aucun ajout simulé, aucune animation**.
- `useFavorites` conservé (mêmes importations), lit désormais le contexte.
- `FavoriteButton` (`src/components/ui/FavoriteButton.tsx`) : composant unique, variantes `overlay` (pastille translucide sur photo) et `inline` (fiche produit). Zone tactile 44 px (48 px en inline), contour discret → cœur rempli rose corail, nom accessible dynamique (« Ajouter X aux favoris » / « Retirer X des favoris »), focus visible, `aria-busy`, `stopPropagation`.
  Animation CSS pure (pulsation, anneau, 6 petits cœurs, ~0,4–0,6 s, `transform`/`opacity` uniquement, aucun décalage de mise en page) ; désactivée sous `prefers-reduced-motion`. Aucune dépendance ajoutée.
- `ProductCard` : le cœur est sorti du lien (frère, plus imbriqué), automatique sur toutes les cartes (marketplace, favoris, similaires, profil producteur), masqué sur ses propres offres et en aperçu de publication.
- Fiche produit : même composant dans tous les cas où l'on n'est pas propriétaire (commandable ou non).
- Page favoris : retrait instantané avec retour si le serveur refuse ; ne recharge que les produits manquants.
- Navigation : « Favoris » ajouté au menu producteur et au tiroir de l'en-tête pour tous les comptes.

## Tests
- Exécutés : analyse syntaxique TS/TSX des 13 fichiers concernés (0 erreur) ; logique pure `withFavorite`/`favoriteLabel` sous Node (immutabilité, idempotence, libellés).
- Écrit mais **non exécuté** : `src/lib/favorites.test.ts` (`npm test`).
- **Non testés** (pas de navigateur, d'appareil ni de Supabase ici) : les 10 scénarios G (ajout/retrait marketplace et fiche, synchronisation des vues, persistance après actualisation, connecté / non connecté, erreur réseau simulée, clics rapides, Android/iOS/ordinateur, performances et accessibilité réelles, lecteur d'écran). À rejouer à la main, idéalement avec un test Playwright.
- À vérifier visuellement : rendu des particules en bordure de carte, contraste du cœur sur photos claires et en mode sombre.
