# Passe 6 — Audit complet de src/ + corrections

## Contexte

Cette passe fait suite aux passes 3 (marketplace) et 5 (panier/commandes/paiement/livraison)
déjà présentes dans le dépôt. Avant toute modification, `src/` a été audité entièrement
(pages, composants, hooks, contexts, services, appels Supabase, routes, boutons) selon la
grille de contrôle demandée : `TODO`/`FIXME`, `any`/`@ts-ignore`, `console.log`,
`href="#"`, gestionnaires vides, `alert()`, `eslint-disable`, données ou statistiques
inventées, bannières trompeuses.

**Limite technique importante** : l'environnement de cette passe n'a ni accès réseau ni
`npm`/`unrar` installés. `npm install`, `npm run typecheck`, `npm run lint` et
`npm run build` n'ont **pas** pu être exécutés ici, exactement comme lors de la passe 5.
Toutes les corrections ci-dessous ont été vérifiées par relecture attentive (imports,
exports, types, cohérence avec les patterns existants), pas par compilation réelle.
**Avant mise en production, lancez `npm install && npm run typecheck && npm run lint && npm run build`.**

## 1. Audit — état constaté

Le projet est nettement plus avancé qu'un point de départ générique :

- **Aucun** `TODO`/`FIXME`, `any`/`@ts-ignore`/`@ts-nocheck`, `console.log`, `href="#"`,
  `onClick={() => {}}` ni `alert()` trouvé dans `src/`.
- Palette (`tailwind.config.js`) déjà conforme à la charte demandée : Forest/Fresh/Deep
  Forest Green, Harvest Orange, Cream, Off-white, Charcoal — aucun bleu/violet SaaS générique.
- Système d'images centralisé déjà en place (`src/lib/image-config.ts`), catégorisé
  (hero, farmers, market, products, harvest, logistics, buyers, cooperatives, technology,
  stories), avec `alt` obligatoire et mention explicite que ce sont des visuels
  éditoriaux (Pexels), pas des photos réelles de producteurs AgriFlow.
- Agri-Match (`AgriMatchPage.tsx`) est une vraie fonctionnalité connectée à Supabase, avec
  un score calculé (`calculateMatchScore`) et un avertissement explicite en bas de page :
  *« Le pourcentage affiché est un score de correspondance indicatif — il ne constitue ni
  une garantie ni une probabilité de vente. »* — conforme à la règle 18.
- Panier / checkout / commandes (passe 5) : logique transactionnelle côté RPC Postgres,
  pas d'écriture directe sur `orders`/`deliveries` depuis le client.
- Profil producteur : commentaire explicite dans le code interdisant d'inventer note,
  nombre de commandes, revenu ou certification — aucune stat fabriquée trouvée nulle part
  dans `src/` (recherche ciblée : témoignages, avis, certifications, chiffre d'affaires).
- Dashboard producteur/acheteur : tous les indicateurs viennent de vraies requêtes Supabase
  (ex. les revenus n'incluent que `payment_status === 'paid'`, jamais les paiements démo).

## 2. Problèmes trouvés et corrigés

### A. Bouton « Favoris » factice (fiche produit)
**Avant** : `ProductDetailPage` gérait le cœur « favori » avec un simple `useState` local —
aucune écriture en base, message de succès affiché malgré tout (« Offre ajoutée à vos
favoris »), bouton visible uniquement en desktop (`hidden lg:flex`). Une vraie table
`favorites` avec RLS complète existait pourtant déjà en base (migration
`20260923202159_create_core_schema.sql`) et n'était simplement pas utilisée.
Violation directe des règles 21 et 55 (« aucun bouton mort », « ne crée pas de fausse
réussite »).

**Corrigé** :
- Nouveau service `src/services/favoritesService.ts` (`isProductFavorited`,
  `fetchFavoriteProductIds`, `addFavorite`, `removeFavorite`) suivant exactement le pattern
  des autres services (`ServiceResult`, `reportError`, gestion du doublon `23505`).
- `ProductDetailPage.tsx` : l'état initial du cœur est chargé depuis la table au montage,
  le clic écrit réellement en base (mise à jour optimiste + retour arrière si l'écriture
  échoue), l'utilisateur invité est redirigé vers `/login` avec retour automatique sur la
  fiche produit (même pattern que `ContactProducerButton`).
- Le bouton est désormais visible sur mobile également (plus seulement `lg:`).

### B. Bannière admin trompeuse
**Avant** : `AdminPage.tsx` affichait *« Mode démonstration — Toutes les données sont
fictives »* alors que la page interroge réellement les tables `profiles`, `products` et
`orders` — ce sont des données live, pas des données inventées. Le seul élément
réellement « démo » du produit est le paiement en ligne. Ce message était donc faux et
risquait d'induire un admin en erreur sur la fiabilité des chiffres affichés.

**Corrigé** : remplacé par le composant `DemoNotice` déjà utilisé ailleurs dans le
produit, avec un message exact : *« Cette vue affiche les données réelles de la base
(utilisateurs, productions, commandes). Seul le paiement en ligne est simulé. »*

### C. Route inconnue → redirection silencieuse au lieu d'une page 404
**Avant** : `<Route path="*" element={<Navigate to="/" replace />} />` — toute URL
invalide renvoyait discrètement vers l'accueil, sans explication (contraire à la section
44 du cahier des charges, qui demande une vraie page « Page introuvable »).

**Corrigé** : nouvelle page `src/pages/NotFoundPage.tsx` (Header/Footer, message clair,
CTA « Retour à l'accueil » et « Explorer les produits »), branchée sur la route `*`
dans `App.tsx`.

## 3. Fichiers modifiés / créés

- **Créés** : `src/services/favoritesService.ts`, `src/pages/NotFoundPage.tsx`,
  `PASSE6-AUDIT.md`
- **Modifiés** : `src/pages/ProductDetailPage.tsx`, `src/pages/AdminPage.tsx`, `src/App.tsx`

## 4. Aucun changement

Routes existantes, schéma Supabase, migrations SQL, RLS, panier/checkout/commandes
(passe 5), marketplace (passe 3), i18n, thème, layout, palette, navigation mobile.

## 5. Ce qui reste à auditer (passes suivantes)

Le cahier des charges couvre 58 sections ; cette passe s'est concentrée sur les bugs
réels trouvés à l'audit (boutons morts, données trompeuses, navigation cassée) plutôt que
sur une réécriture visuelle globale déjà largement en place. Restent à vérifier
spécifiquement dans une prochaine passe :
- Page **Paramètres** dédiée (compte, notifications, confidentialité, accessibilité —
  section 28) : aujourd'hui la langue et le thème se gèrent depuis le header
  (`LanguageSwitcher`, `ThemeToggle`) et les infos de compte depuis `/profile`, mais il
  n'existe pas de page « Paramètres » centralisée.
  - Test réel du responsive à 360/390/414 px et 768/1024/1440 px (nécessite un navigateur —
  non exécutable dans cet environnement sans accès réseau).
- Couverture complète des 7 langues prévues dans `src/lib/i18n/translations.ts`
  (vérifier qu'aucun texte affiché ne référence une clé de traduction manquante).
- Vérification du mode sombre sur chaque composant (contrastes, cartes, modales, images).
- `npm run build` / `npm run typecheck` / `npm run lint` réels, dès qu'un environnement
  avec accès npm est disponible.

## 6. Tests effectués

Relecture manuelle du code (pas d'exécution) : routes de `App.tsx` une à une, grep ciblé
sur tout `src/` pour les anti-patterns listés en section 57 du cahier des charges,
lecture complète de `ProductDetailPage`, `AdminPage`, `AgriMatchPage`, `DashboardPage`,
`ProfilePage`, vérification croisée que `favoritesService` correspond exactement au
schéma RLS de la table `favorites`, vérification que la redirection invité du nouveau
bouton favoris est compatible avec la logique `from` déjà présente dans `LoginPage`.

## 7. Problèmes restants connus

- Favoris : possibilité fonctionne uniquement depuis la fiche produit ; il n'existe pas
  encore de page listant tous les favoris de l'utilisateur. La table le permet déjà
  (`fetchFavoriteProductIds` est prête), reste à créer la page si souhaité.
- Build/typecheck/lint non exécutés (voir limite technique en introduction).
