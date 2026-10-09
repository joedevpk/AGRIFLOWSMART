# AgriFlow RDC — Passe 8 : rapport (responsive, stabilisation)

Branche : `fix/passe8-smart-responsive` (base : zip `AGRIFLOWSMART-main-mobile-fix`).

## Constat de départ
Typecheck (app + edge), ESLint, 104 tests Vitest et build : tous verts avant modification.
Déjà présents et relus : `ScrollManager` central (bug « page au niveau du footer »), nav mobile, safe areas,
FavoriteButton (contour/rempli, animation, rollback, anti-double-clic, reduced-motion, cible 44 px),
tableaux dans des conteneurs à défilement interne, aucun `overflow-x: hidden` global.

## Méthode de test
Chromium headless réel (paquet npm `@sparticuz/chromium` + puppeteer-core), build de production servi par `vite preview`,
Supabase intercepté (réponses vides + profil simulé). Mesure : `scrollWidth > clientWidth` à 320, 360, 375, 390, 430, 768, 1024, 1280, 1440 px,
puis bisect (masquage d'éléments) pour trouver la cause.

## Problèmes trouvés, causes, corrections
| Page | Problème | Cause | Correction |
|---|---|---|---|
| Publication produit | page de 1397 px (mobile) / 2081 px (desktop) | grille sans `grid-cols-1` : piste `auto` = largeur de la ligne de chips | `grid-cols-1` + `minmax(0,1fr)` |
| 41 grilles du projet | risque identique avec données longues | même motif | `grid-cols-1` de base, `[1fr_…]` → `[minmax(0,1fr)_…]` |
| Accueil 320 px | cartes acheteurs trop serrées | 2 colonnes + `p-6` | 1 col < 400 px, `p-5 sm:p-6`, `break-words` |
| Marketplace 320/360 px | barre résultats/filtres/tri débordait | pas de `flex-wrap` | `flex-wrap`, `min-w-0` |
| Demandes producteur | boutons trop larges (469 px) | rangée sans repli | `flex-wrap` |
| Profil 320 px | badges rôle/type/vérifié | pas de repli | `flex-wrap` |
| En-tête connecté 320 px (panier, résultat paiement) | 348 px | logo + 4 boutons 44 px | boutons 36 px de large sous 360 px (hauteur 44 px conservée) |

Fichiers modifiés : 30 (classes Tailwind uniquement ; `git diff --stat` pour le détail). Aucun changement de logique, de schéma, de migration, de secret ni d'Edge Function.

## Résultats exacts
- `npm run typecheck`, `typecheck:edge`, `npm run lint` : sans erreur.
- `npm test` : 13 fichiers, 104 tests passés.
- `npm run build` : OK.
- Débordement horizontal, 9 largeurs : routes publiques 0/198 ; acheteur 0/126 ; producteur 0/90 ; administrateur 0/27.

## Limites (non vérifié)
- Tests faits avec données vides : tableaux/cartes remplis non exercés visuellement.
- Parcours panier → livraison → paiement CinetPay → confirmation → suivi non exécuté de bout en bout (compte sandbox et données réelles requis).
- Aucune configuration Capacitor dans le dépôt : pas de test WebView. Android Chrome et Safari iOS réels, clavier virtuel, permissions caméra/localisation : à tester sur appareils.
- Pages cooperative non testées comme rôle distinct ; routes dynamiques testées avec identifiants factices.
- Aucune action requise sur Supabase, CinetPay ou Render pour cette passe.

## Reconstruire et vérifier
```
npm ci
npm run typecheck && npm run typecheck:edge && npm run lint && npm test && npm run build
```
