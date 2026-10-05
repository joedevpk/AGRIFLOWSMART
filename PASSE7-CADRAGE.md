# Passe 7 — Audit et corrections selon le cadrage « Sujet 1 »

Principe directeur : **AGRIFLOW RDC réduit la distance entre celui qui produit et celui qui achète.**
Parcours cœur : producteur → production → mise en vente → acheteur → commande → paiement (démo) → livraison.

## Vérifications réellement exécutées

Contrairement aux passes 5 et 6, cette passe a un accès npm et PostgreSQL :

| Vérification | Résultat |
|---|---|
| `npm install` | OK |
| `npm run typecheck` | 0 erreur |
| `npm run lint` | 0 erreur (6 avertissements `react-refresh` préexistants, sans impact) |
| `npm run build` | OK |
| 5 migrations SQL appliquées sur PostgreSQL 16 (avec rôles/schémas Supabase simulés) | OK, sans erreur |
| Parcours complet en base (`supabase/tests/`) | OK — voir ci-dessous |

**Non testé** : navigation réelle dans un navigateur contre un vrai projet Supabase (pas de navigateur ni de projet Supabase dans cet environnement). Le parcours a été validé côté base (RPC, RLS, statuts, stock) et côté compilation, pas par clics.

### Parcours de bout en bout testé en base (`supabase/tests/10_e2e_order_lifecycle.sql`)
producteur publie « Maïs 500 kg » → le modifie → l'acheteur (restaurant) crée une demande → commande 500 kg avec paiement Mobile Money **de démonstration** (`demo_paid`) → stock 600 → 100 → rejeu du même checkout sans doublon → le producteur confirme, prépare, marque prête, démarre la livraison, confirme la livraison → l'acheteur confirme la réception → commande `completed`.
Historique obtenu : `pending > confirmed > preparing > ready > in_delivery > delivered > completed`, livraison `delivered`, 7 notifications. Un tiers ne voit ni ne modifie la commande. Un acheteur ne peut plus publier d'offre.

## 1. Audit — ce qui ne respectait pas le cadrage

| # | Problème | Règle du cadrage | Gravité |
|---|---|---|---|
| 1 | Accueil : « 1 200+ producteurs, 3 400+ productions, 850+ acheteurs, 2 100+ commandes » (aussi dans l'écran de connexion/inscription) | §25 aucune fausse statistique | Élevée |
| 2 | Accueil : badge « Producteur vérifié », carte « Commande confirmée » avec 5 étoiles, « 500 kg disponibles » présentés comme réels | §25 | Élevée |
| 3 | « Paiement sécurisé » (accueil, comment ça marche) alors que le paiement est simulé ; « acheteurs vérifiés », « livraison en temps réel », « Qualité traçable » | §6, §13, §25 | Élevée |
| 4 | **Agri-Match faux** : un produit sans rapport avec la demande (ex. maïs pour des tomates) obtenait ≥ 47 % dès que la quantité suffisait ; les unités (kg / tonne / sac) n'étaient pas converties | §4 | Élevée |
| 5 | Le producteur ne pouvait **pas modifier** une offre (le menu « Modifier » ouvrait en réalité la fiche publique) ni la retirer/remettre en vente | §1 | Élevée |
| 6 | Demandes d'achat côté producteur : aucune action possible (impasse) ; l'acheteur était affiché comme « producteur » dans la carte de correspondance | §1, §24 | Moyenne |
| 7 | Tableau de bord : « Commandes reçues » et revenus calculés sur les 10 dernières commandes seulement (chiffres faux) ; acheteur sans action principale | §15, §16 | Moyenne |
| 8 | Un acheteur pouvait publier une offre en contournant l'interface (RLS trop large) | §1 | Moyenne |
| 9 | Demandes d'achat impossibles à clôturer ; envoi de message qui échoue en silence | §24 | Faible |
| 10 | Pied de page : « Hackathon Agriculture & Agro-industrie » (ne nomme pas le Sujet 1) | §26 | Faible |

Points déjà conformes (non modifiés) : aucun bouton mort ni `href="#"`, panier/checkout/commandes transactionnels via RPC, paiement de démonstration clairement signalé (`DemoNotice`), revenus sans paiements démo, profil producteur sans note ni certification inventées, aucune dérive vers météo / USSD / blockchain / QR / traçabilité.

## 2. Corrections

- **Honnêteté des données** : statistiques fictives remplacées par la chaîne *Producteur → AgriFlow RDC → Acheteur* ; faux badges retirés ; carte de suivi étiquetée « Illustration » ; encart Agri-Match étiqueté « Exemple illustratif (aucune donnée réelle) » ; mentions « sécurisé / vérifié / temps réel / traçable » remplacées par des formulations exactes (`LandingPage`, `HowItWorksPage`, `BuyersPage`, `AuthLayout`, pied de page, `translations.ts` FR).
- **Agri-Match** (`src/lib/agri-match.ts`, remplace `calculateMatchScore` de `utils.ts`) : produit obligatoire (sinon score 0, jamais proposé) ; unités converties ; ville > province ; budget ; disponibilité ; **chaque critère explique en une phrase pourquoi le producteur correspond** (« Quantité suffisante : 1 000 kg disponibles pour 500 demandés »…). Cartes : « Voir et commander » + « Contacter ».
- **Producteur** : page *Modifier ma production* (`/producer/products/:id/edit`, même formulaire que la publication, statut de l'offre, photos), menu « Modifier / Voir l'offre / Marquer épuisée / Remettre en vente / Supprimer » (message clair si l'offre est liée à des commandes), lien « Modifier » depuis sa propre fiche.
- **Demandes d'achat (producteur)** : meilleure offre du producteur pour chaque demande avec les raisons, filtre « Correspond à mes productions », « Contacter l'acheteur » (messagerie réelle), « Voir mon offre », « Publier une production ».
- **Tableaux de bord** : chiffres calculés sur toutes les données (200 dernières commandes), alerte « N commandes à confirmer », actions principales par rôle (producteur : publier / commandes / demandes ; acheteur : rechercher / publier une demande / panier), demandes qui correspondent aux productions du producteur, Agri-Match depuis le tableau de bord acheteur, « Panier » dans le menu acheteur.
- **Demandes acheteur** : « Marquer satisfaite » / « Clôturer » ; validation de la quantité.
- **Sécurité** : migration `20260924180000_products_sellers_only.sql` — seuls producteur, coopérative et admin peuvent publier une offre ; `SellerRoute` redirige les acheteurs hors des pages vendeur.
- **Messagerie** : l'échec d'envoi est signalé (plus de `console.error` silencieux).

## 3. Fichiers

Créés : `src/lib/agri-match.ts`, `supabase/migrations/20260924180000_products_sellers_only.sql`, `supabase/tests/{README.md,00_supabase_stubs.sql,10_e2e_order_lifecycle.sql}`, `PASSE7-CADRAGE.md`.
Modifiés : `App.tsx`, `LandingPage`, `HowItWorksPage`, `BuyersPage`, `AuthLayout`, `Header` (pied de page), `DashboardLayout`, `DashboardPage`, `ProducerProductsPage`, `PublishProductPage`, `ProducerRequestsPage`, `BuyerRequestsPage`, `AgriMatchPage`, `ProductDetailPage`, `MessagesPage`, `ContactProducer`, `Timeline` (MatchCard), `utils.ts`, `translations.ts`.

**À faire au déploiement** : appliquer la nouvelle migration sur Supabase (`supabase db push` ou éditeur SQL).

## 4. Restant / décisions à connaître

- Le producteur peut aussi passer une commande livrée à « terminée » (comportement d'origine, conservé) ; l'acheteur garde son bouton « Confirmer la réception ».
- Traductions lingala / kikongo / kiswahili / tshiluba : seuls les textes FR ont été reformulés (pied de page, badge d'accueil) ; les autres langues gardent leur formulation précédente, sans mention fausse.
- Pas de page « Favoris » (la table et le service existent) ni de page Paramètres : hors priorité 1 du cadrage.
- Aucune donnée de démonstration n'est injectée en base : pour la démo, créer un compte producteur, un compte restaurant, puis suivre le parcours ci-dessus.
- Le bundle JS dépasse 500 kB (avertissement Vite) ; le découpage par routes est une optimisation possible.
