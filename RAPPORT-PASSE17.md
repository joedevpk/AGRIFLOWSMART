# PASSE 17 — Rapport

## Dashboard producteur
- `/dashboard` (producteur/coopérative) : composant `ProducerDashboard` — actions prioritaires, actions rapides, indicateurs, commandes à traiter (avec actions du workflow existant via `OrderQuickActions`), mes produits, mon agriculture, opportunités Agri-Match, « À faire aujourd'hui » (« Tout est à jour. » si vide), empty states.
- Toutes les valeurs viennent de Supabase (produits, commandes, demandes) ou des parcelles enregistrées sur l'appareil. Aucun chiffre fictif. Le score Agri-Match affiché est celui réellement calculé par `calculateMatchScore` (libellé « score indicatif »).
- Stock : l'application ne définit AUCUN seuil de stock faible → seuls « En stock » / « Rupture » sont affichés (`lib/producer-insights.ts`).
- Nouvelle page `/producer/sales` (Mes ventes) : commandes réellement payées (paiements de démo exclus), période 7 j / 30 j / tout, total, produits vendus, net après commission ; pas de graphique (données insuffisantes) ; rappel que le versement producteur est manuel.
- `/producer/products` : recherche, filtres de statut (synchronisés avec `?status=`), tableau desktop / cartes mobile, actions visibles (plus de menu déroulant).
- `/profile` : envoi de photo vers le bucket `avatars` (RLS existante), layout responsive.
- `/notifications` : catégories (déduites du `type` réel), filtres lues/non lues/type, compteur de non lues dans l'en-tête et la sidebar.

## Sidebar / navigation
- `components/layout/dashboard-nav.tsx` : sections Accueil / Mon activité / Mon agriculture / Opportunités / Communication / Compte / Aide, uniquement des routes existantes.
- Entrées demandées MASQUÉES car sans page réelle : Mes clients, Mes cultures, Analyse de terrain (dans le détail d'une parcelle), Paramètres.
- État actif : icône, libellé, fond léger, barre verte, `aria-current`.
- Drawer mobile : dialogue modal (`role="dialog"`, `aria-modal`), Échap, piège de focus, restitution du focus, scroll verrouillé, fermeture après navigation. Bottom nav conservée.
- En-tête : fil d'Ariane AgriFlow / page, notifications (compteur réel), avatar.

## Pages institutionnelles
- `/comment-ca-marche` (`/how-it-works` redirige), `/cooperatives`, `/entreprises`, `/help` (FAQ avec recherche + catégories), `/contact`.
- Contenu limité au réellement implémenté ; les étapes manuelles (versement producteur, transporteur) sont signalées.
- Contact : aucune coordonnée inventée. Lecture de `VITE_CONTACT_EMAIL/PHONE/WHATSAPP/ADDRESS` (`.env.example`) ; si vide, la page l'indique. Pas de formulaire (aucun backend pour recevoir les messages).
- Footer et header mis à jour.

## SEO
- Hook `useSeo` (sans dépendance) : title, description, og:*, twitter:*, robots noindex pour les pages privées. Branché sur accueil, marketplace, produit, producteur, 4 pages institutionnelles, dashboard.
- `index.html` : ajout og:image / twitter:* par défaut (image Wikimedia déjà cataloguée).
- Limite : SPA sans SSR — les crawlers qui n'exécutent pas JS ne verront que `index.html`.

## Base de données
- Aucune migration.

## Tests — ce qui a réellement été fait
- `npm ci` impossible dans mon environnement (registre npm bloqué, 403) : **`npm run typecheck`, `npm run lint`, `npm run build` NON EXÉCUTÉS.**
- Seul contrôle réalisé : `tsc` global sur le projet sans dépendances installées : aucune erreur de syntaxe ; une erreur de typage réelle (site-contact.ts) corrigée ; le reste des erreurs vient des modules absents (react, lucide-react…).
- Aucun test navigateur, aucun test de résolution (360→1920) : la mise en page a été écrite avec des classes responsive mais **non vérifiée visuellement**.

## À faire de votre côté
1. `npm ci && npm run typecheck && npm run lint && npm run build` puis corriger d'éventuelles erreurs.
2. Renseigner les `VITE_CONTACT_*` officiels.
3. Test manuel des 16 parcours listés dans la passe.
