# PASSE 22 — TERMINÉE (partielle)

## Fonctionnalités réellement implémentées
- Confirmations : `useConfirmAction` + `ConfirmDialog` remplacent les 3 derniers `window.confirm` (AdminPage, OrderDetailPage, OrderQuickActions). État loading pendant les actions asynchrones.
- Checkout : résumé repliable sur mobile, barre sticky (total + CTA), libellés du workflow réel, « Traitement en cours… », double envoi bloqué. Logique métier du paiement inchangée.
- Confirmation de commande : date, « Suivre ma commande », « Traitement du paiement… ». Référence réelle uniquement.
- Commandes : `OrdersList` partagé (acheteur/producteur), filtres sur statuts existants, tableau desktop / cartes mobile, états vides.
- Dashboard acheteur : `BuyerDashboard` (actions prioritaires réelles, stats réelles, commandes récentes, demandes).
- Agri-Match : erreur de chargement distincte de « aucune correspondance », réessai, explication du score.
- AgriGuide : recherche, filtres par catégorie, état vide.
- Ma Parcelle : « Ajouter une parcelle », date de plantation, activité du mois (calendrier de zone).
- Calendrier : timeline verticale mobile.
- Contact / Aide : titre « Comment pouvons-nous vous aider ? », catégories, `/help?cat=`.
- Admin : totaux réels (requêtes count), erreur + réessai, recherche, filtres, pagination.
- Favoris : `useFavorites`, bouton cœur sur les cartes marketplace, page `/favorites`, entrée de menu acheteur.
- SEO : titres/descriptions ajoutés ; pages privées en noindex.

## Base de données / RLS
Aucune migration : la table `favorites` (RLS propriétaire + admin) existait déjà. Erratum passe 21 : le service et le bouton favori de la fiche produit existaient aussi.

## Tests
Typecheck : PASS · Lint : PASS · Build : PASS · Liens internes vs routes : vérifiés par script.
Aucun test navigateur, responsive 360–1920 px, dark mode visuel, clavier ni paiement CinetPay réel n'a été effectué.

## Reste à faire
Vérification visuelle (clair/sombre), Analyse de terrain et Paramètres (routes absentes), sélecteur Light/Dark/System, profil producteur, fiche produit, auth.
