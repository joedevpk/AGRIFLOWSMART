# AGRIFLOW

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-gh7yjfjd)

## Passe 11 — correctifs (produits, navbar, admin)

- Migration `supabase/migrations/20260924200000_fix_products_insert_and_admin_bootstrap.sql` : corrige l'ajout de produits et crée le compte admin (voir l'en-tête du fichier).
- Navbar en vert, boutons de l'en-tête alignés (hauteur 44 px), `Button` sans retour à la ligne.
- `/admin` : vérifier un compte, changer un rôle, masquer / publier / supprimer une offre.

## Passe 12 — AgriGuide, Ma Parcelle, Calendrier agricole, mode faible connexion

### Ce qui a été ajouté (réellement fonctionnel)
- **AgriGuide** (`/agriguide`, `/agriguide/:cropId`) : 10 fiches culture (maïs, manioc, tomate, riz, haricot, arachide, légumes, banane, café, cacao), chacune avec les 10 étapes (présentation → commercialisation), conseils pratiques, et un onglet dédié aux ressources hors connexion.
- **Parcours d'apprentissage** : progression par étape et par culture (`learning_progress`), cochage en un clic, barre de progression, fonctionne hors connexion (écriture locale puis synchronisation).
- **Ma Parcelle** (`/plots`, `/plots/:id`) : création/édition/suppression de parcelles (`user_plots`), géolocalisation par GPS de l'appareil (lien OpenStreetMap, pas de nouvelle carte propriétaire), notes de parcelle (`plot_notes`).
- **Analyse de terrain et indice d'aptitude** : `src/lib/agri/suitability.ts` calcule un indice 0–100 à partir des seuls facteurs disponibles (climat de zone, sol et eau déclarés par l'agriculteur) ; jamais présenté comme une probabilité de réussite ; chaque facteur affiche sa source (climatique / pédologique / satellite — explicitement marquée non connectée / renseignée par l'agriculteur).
- **Calendrier agricole** (`/calendar`) : vue 12 mois par culture × zone, calendrier détaillé (préparation/semis/entretien/récolte) fondé sur des règles explicites (régime des pluies de la zone + durée de cycle), jamais de règle absolue.
- **Mode faible connexion** : indicateur Connecté/Connexion faible/Hors connexion (`ConnectionBadge`), file de synchronisation persistante (`OfflineQueue`) pour parcelles/notes/progression avec gestion réseau coupé / session expirée / conflit / refus serveur, brouillon de publication de produit sauvegardé localement, service worker (`public/sw.js`) pour les pages et fiches déjà visitées.
- **Liaison avec Agri-Match** : chaque fiche culture et chaque parcelle affichent le nombre de demandes d'achat ouvertes correspondantes et un bouton direct « Publier ma production » (préremplit le formulaire existant via `?crop=&qty=&unit=&zone=`).
- **Dashboard producteur** : section « 🌱 Mon agriculture » (parcelles, apprentissage, calendrier, analyses).
- **Page d'accueil** : section « De la parcelle au marché » (6 étapes), qui ramène toujours vers Agri-Match / la vente.

### Nouvelles tables Supabase (migration `20260924220000_agri_modules.sql`)
`user_plots`, `plot_notes`, `learning_progress` — RLS stricte (propriétaire uniquement), aucun accès anonyme.

### Hors connexion — ce qui fonctionne réellement
Disponible : fiches AgriGuide et calendrier une fois l'app visitée (+ bouton « Préparer le mode hors connexion »), parcelles/notes/progression déjà chargées, brouillon de produit, écriture de nouvelles parcelles/notes/progression (mises en file, synchronisées ensuite).
Non disponible (et annoncé comme tel dans l'app) : marketplace, panier, commande, paiement, confirmation de stock, Agri-Match, messages — ces actions affichent « Une connexion est nécessaire » plutôt que d'échouer silencieusement.

### Sources des données agricoles
Plages écologiques et principes agronomiques : ordres de grandeur usuels (type FAO EcoCrop) et bonnes pratiques générales — à valider avec l'INERA ou un service agricole local. Données climatiques de zone : moyennes indicatives par ville de référence, aucune API météo/satellite connectée. Ce n'est précisé nulle part comme mesure exacte ; le panneau « Source des données » le rappelle sur chaque analyse.

### Tests effectués
- Logique pure (`src/lib/agri/*`, `src/lib/offline/*`) : compilée et exécutée isolément avec `tsc`/`node` (16 cultures × zones, calendrier maïs/tomate/manioc à Kinshasa, indice d'aptitude avec/sans données, file hors ligne : réseau coupé / session expirée / refus serveur — tous les scénarios passent, voir historique de build).
- Vérification statique de l'ensemble du projet : équilibre des accolades/parenthèses et résolution de tous les imports (`@/...` et relatifs) sur les 33 fichiers créés/modifiés — aucune erreur.
- **Non fait faute d'accès réseau dans cet environnement** : `npm install`, `npm run build`, `npm run typecheck` et test dans un vrai navigateur (y compris DevTools "Offline"). À exécuter avant mise en production.

### Problèmes connus / restants
- Le mode hors connexion dépend du service worker, actif uniquement en build de production (`npm run build && npm run preview`), pas en `npm run dev`.
- La géolocalisation de parcelle utilise l'API GPS du navigateur (pas de composant carte) : c'est un choix pour rester sur l'existant plutôt qu'ajouter une dépendance cartographique.
- Le calcul de l'indice d'aptitude est un outil pédagogique simple (règles explicites), pas un modèle agronomique validé.

## Production (passe 24)
`docs/DEPLOYMENT.md` (Supabase CLI, secrets, Render) · `docs/CRON.md` · `docs/MONITORING.md` · `docs/BACKUP-RESTORE.md` · `docs/ARCHITECTURE.md` · `docs/PRODUCTION-CHECKLIST.md`.
Vérification locale complète : `npm run check` (typecheck, edge, lint, tests, contrôle des migrations, build) puis `bash supabase/tests/run-all.sh` (PostgreSQL : migrations depuis une base vierge + RLS + paiement + concurrence).
