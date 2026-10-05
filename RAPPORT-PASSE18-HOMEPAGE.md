# Passe 18 — Homepage premium (UI uniquement)

Périmètre : page d'accueil (`/`). Aucune logique métier, route, service ni schéma Supabase modifié.

## Fichiers modifiés / créés
| Fichier | Nature |
|---|---|
| `src/components/layout/HomeHeader.tsx` | **Créé.** Navbar de l'accueil : transparente sur le hero, fond Forest Green plein après 24 px de défilement, menu desktop dès 1280 px, tiroir animé en dessous, panneau de recherche, panier, thème/langue conservés. |
| `src/pages/LandingPage.tsx` | Hero plein écran (carrousel existant en fond + overlay), CTA « Explorer les produits » / « Vendre ma production », animation d'entrée légère, suppression des badges flottants et des emojis, pastilles de recherche et bouton « Rechercher » corrigés. |
| `src/components/ui/HeroCarousel.tsx` | Nouvelle prop `variant="background"` (défaut `panel` = rendu d'origine). Même fonctionnement : rotation, swipe, pause au survol, points, flèches, `prefers-reduced-motion`. |
| `src/lib/image-config.ts` | `HOME_HERO_CAROUSEL` : retrait de la photo de camion (peu agricole en hero). Photo de Kinshasa toujours en premier. |
| `src/lib/i18n/translations.ts` | FR : `hero.title`, `hero.ctaPrimary` alignés sur le brief ; nouvelles clés `nav.forProducers`, `nav.forEnterprises`, `nav.start`, `nav.search`, `nav.connection` (les autres langues retombent sur le français). |
| `src/pages/AdminPage.tsx`, `src/components/dashboard/ProducerDashboard.tsx` | Correction de 2 erreurs déjà présentes (typecheck : `DemoNotice` recevait un tableau ; lint : import `Button` inutilisé). |

`Header.tsx` (navbar des autres pages) n'a pas été modifié.

## Vérifications réussies
- `npm run typecheck` : 0 erreur
- `npm run lint` : 0 erreur
- `npm run build` : succès
- Navigateur headless (Chrome 131), page `/` à 360, 390, 414, 768, 1024, 1280 et 1440 px : aucun débordement horizontal, CTA de 48 à 56 px de haut, navbar transparente puis `rgb(22,58,36)` au défilement, tiroir ouvert/fermé (Échap, défilement de page bloqué puis restauré), recherche vers `/marketplace?q=…`, aucune erreur JavaScript, aucun emoji dans le texte de la page.

## Limites
- Les hôtes d'images (Wikimedia, Pexels, Unsplash) ne sont pas joignables depuis l'environnement de travail : le cadrage et la lisibilité ont été testés avec une photo de remplacement **claire** (pire cas), pas avec les vraies photos. À contrôler à l'œil après déploiement.
- Seule la photo de Kinshasa est documentée comme RDC ; les autres ne sont pas confirmées RDC (voir `CREDITS-IMAGES.md`, attribution CC BY-SA à compléter).
- Non testé : état connecté (menu compte), vrai appareil mobile, Lighthouse.
- Les sections plus bas dans la page d'accueil n'ont pas été retravaillées (hors emojis et section recherche).
