# Passe 20 — UI globale (1re passe : design system, navbar, marketplace)

## PASSE UI — TERMINÉE (partielle : 4 étapes sur 25 de l'ordre de travail)

### Pages améliorées
- **Toutes les pages internes** (Marketplace, produit, panier, producteurs, aide, contact, légales…) : navbar unifiée avec celle de l'accueil.
- **Marketplace** : en-tête « Marketplace agricole » + sous-titre du brief, recherche conservée, tri accessible en un clic (liste déroulante), grille jusqu'à 4 colonnes dès 1700 px, correction du mode sombre de l'en-tête (dégradé clair + texte crème = illisible auparavant).
- Accueil : **non modifiée** (comportement identique, `HomeHeader` par défaut en mode `overlay`).

### Composants créés/modifiés
- `components/layout/HomeHeader.tsx` : nouvelle prop `variant` (`overlay` = accueil, `solid` = pages internes : collante, fond Forest Green plein). Ajout d'une cloche **Notifications** avec compteur réel de non lues (hook existant `useUnreadNotifications`, aucune nouvelle requête), liens « Centre d'aide » et « Contact » dans le tiroir.
- `components/layout/Header.tsx` : `Header` = `<HomeHeader variant="solid" />`. Ancienne barre (menu burger jusqu'à 1399 px, 6 liens différents) supprimée : plus de navbar différente d'une page à l'autre. `Footer` inchangé (contient déjà toutes les colonnes demandées, aucun contact ni réseau social inventé).
- Créés : `ui/PageHeader.tsx`, `ui/SectionHeader.tsx`, `ui/CTASection.tsx` (exportés dans `ui/index.ts`). `CTASection` n'est pas encore utilisé : prévu pour les pages Producteurs / Entreprises / Comment ça marche.
- Modifié : `pages/MarketplacePage.tsx` (utilise `PageHeader`, tri, grille).

### Navigation obtenue (toutes pages publiques)
Accueil · Marketplace · Comment ça marche · Pour les producteurs · Pour les entreprises. À droite : Recherche, Panier, Thème/Langue, Connexion, Commencer. Connecté : Notifications, avatar (Tableau de bord, Profil, Déconnexion), « Vendre ma production » (masqué pour un acheteur). Mobile : tiroir animé avec CTA visible en bas. Les liens Acheteurs, Agri-Match, AgriGuide, Coopératives restent accessibles dans le tiroir (« Explorer »).

### Responsive / Accessibilité / SEO
- Menu desktop dès 1280 px (comme l'accueil, déjà testé à 1280–1440). En dessous : tiroir. Cibles tactiles ≥ 44 px, `aria-current`, `aria-label` (notifications avec compteur), Échap/piège de scroll dans le tiroir (code existant réutilisé), `prefers-reduced-motion` déjà global.
- SEO : titre Marketplace inchangé (« Marketplace agricole RDC | AgriFlow »).

### Fonctionnalités préservées
Routes, Supabase, panier, thème/langue, filtres, recherche avec debounce, URL comme source de vérité. Aucune donnée inventée, aucun faux badge.

### Tests
- **Typecheck : NON EXÉCUTÉ** — `node_modules` absent et aucun accès réseau dans mon environnement.
- **Lint : NON EXÉCUTÉ** (idem). Vérification manuelle des imports inutilisés sur les fichiers modifiés.
- **Build : NON EXÉCUTÉ** (idem).
- Seule vérification réelle : analyse syntaxique TypeScript/JSX des 7 fichiers touchés (OK). **Aucun test navigateur.**
→ À lancer chez vous : `npm ci && npm run typecheck && npm run lint && npm run build`, puis contrôle visuel de `/marketplace` et d'une page interne à 360, 768, 1280 et 1440 px (barre à 1280–1440 px, connecté et non connecté).

### Pages restantes (ordre du brief)
Fiche produit, profil producteur, dashboards producteur/acheteur (sidebar, « à faire aujourd'hui »), panier, checkout, commandes, Agri-Match, AgriGuide, Ma Parcelle, Calendrier, Analyse terrain, landing Producteurs / Entreprises / Coopératives, Comment ça marche, Contact, Aide, Paramètres, Auth, Admin.
Points à trancher pour la suite : bouton Favori sur les cartes et page Favoris (aucune route « favoris » n'existe alors que `favoritesService` est présent) ; page Analyse terrain et Paramètres dédiés (routes absentes).
