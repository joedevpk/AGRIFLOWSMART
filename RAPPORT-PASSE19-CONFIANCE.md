# Passe 19 — Centre de confiance, confidentialité, cookies et politiques

Aucune fonctionnalité métier modifiée (Marketplace, Auth, commandes, paiement, livraison, Agri-Match…).
`npm run typecheck` ✅ · `npm run lint` ✅ · `npm run build` ✅.

## ⚠️ À faire avant de tester le compte
Appliquer la nouvelle migration : `supabase db push` (fichier `20260928210000_account_deletion_requests.sql`).
Sans elle, la section « Suppression du compte » affiche « Impossible de vérifier l'état de votre demande ».

## Pages créées (5) — routes ajoutées
| Route | Fichier | Titre SEO |
|---|---|---|
| `/confidentialite` (15 sections) | `pages/legal/PrivacyPage.tsx` | Politique de confidentialité \| AgriFlow RDC |
| `/conditions` (19 sections) | `pages/legal/TermsPage.tsx` | Conditions d'utilisation \| AgriFlow RDC |
| `/cookies` (+ interface de gestion) | `pages/legal/CookiesPage.tsx` | Politique de cookies \| AgriFlow RDC |
| `/remboursement` | `pages/legal/RefundPage.tsx` | Politique de remboursement \| AgriFlow RDC |
| `/confiance` | `pages/legal/TrustCenterPage.tsx` | Centre de confiance \| AgriFlow RDC |

`/contact` existait déjà (titre « Contact \| AgriFlow RDC » conservé). Les 5 pages sont chargées à la demande (lazy).
Gabarit commun : héro, bouton Retour, date de dernière mise à jour, sommaire latéral sticky (desktop) avec section active,
barre de sommaire sticky repliable (mobile), ancres, tableaux → cartes sur mobile, navigation croisée « Voir aussi ».

## Composants créés / modifiés
Créés : `components/consent/{ConsentManager,CookieBanner,CookiePreferencesModal,ConsentCategories}.tsx`,
`components/legal/{LegalLayout,blocks,ContactBlock}.tsx`, `components/account/PrivacySettings.tsx`,
`hooks/useModalA11y.ts` (focus piégé, Échap, restitution du focus), `lib/consent.ts`, `lib/legal/meta.ts`,
`services/privacyService.ts`, migration SQL.
Modifiés : `App.tsx` (routes + `ConsentManager`), `layout/Header.tsx` (footer + correctif de largeur, voir plus bas),
`contexts/ThemeContext.tsx` et `LanguageContext.tsx` (mémorisation soumise au consentement), `pages/ProfilePage.tsx`
(section confidentialité + ancre `#profil-form`), `index.css` (styles de lecture des textes longs).

## Footer
Nouvelle colonne « Informations & confiance » : Centre de confiance, Politique de confidentialité, Conditions,
Politique de cookies, **Gestion des cookies** (ouvre la modale), Remboursement, Protection des données.
Ajoutés : Centre d'aide, Contact, À propos d'AgriFlow (→ Comment ça marche), AgriGuide. **Aucun lien social** (aucun n'existe dans le projet).

## Logique cookies (`lib/consent.ts`)
Constat vérifié dans le code : AgriFlow ne pose **aucun cookie HTTP** (`document.cookie` absent) et n'intègre **aucun outil
analytique/publicitaire**. Il utilise localStorage / sessionStorage / cache du service worker.
- **Nécessaires** (session Supabase, panier, brouillons, file hors-ligne, choix de consentement) : toujours actifs.
- **Préférences** (thème, langue) : mémorisées **seulement avec accord** ; sans accord, elles fonctionnent pendant la visite
  mais ne sont pas enregistrées ; un retrait de consentement les supprime immédiatement.
- **Analytiques** : affichées comme « Non utilisés » (`ANALYTICS_AVAILABLE = false`), non activables. Pour en ajouter un : passer le drapeau à `true` et ne charger l'outil que si `getConsent()?.analytics`.
- Bannière de première visite non bloquante ; « Tout accepter » et « Refuser les cookies non essentiels » ont **exactement** le même style et la même taille (testé) ; rien n'est pré-coché ; Échap = aucun choix enregistré.
- Le choix est stocké dans le navigateur (`agriflow_consent`), synchronisé entre onglets, jamais envoyé au serveur.

## « Mes données et ma confidentialité » (`/profile#confidentialite`)
- **Consulter** le profil (nom, e-mail, téléphone, province, ville, profil, date) ; **modifier** via le formulaire existant juste au-dessus.
- **Préférences** de cookies (ouvre la modale).
- **Copie des données (JSON)** — réellement implémentée, générée dans le navigateur : profil, offres, demandes, commandes (+ lignes, historique, livraisons, remboursements), paiements (colonnes explicites, sans `checkout_url`), messages, notifications, favoris, avis, parcelles, progression. Chaque requête est filtrée sur l'utilisateur **et** protégée par RLS ; plafonnée à 5 000 lignes par liste.
- **Suppression = DEMANDE, jamais automatique.** Confirmation obligatoire (texte demandé, case à cocher, nombre de commandes en cours, motif facultatif, focus par défaut sur « Annuler »). La demande est enregistrée par la RPC `request_account_deletion`, annulable (`cancel_account_deletion`) tant qu'elle n'est pas « en traitement ». Aucun `DELETE` n'est émis par le client (testé).

## Sécurité (migration `20260928210000_account_deletion_requests.sql`)
Table `account_deletion_requests` : RLS activé, `anon` sans accès, **aucune policy INSERT/UPDATE/DELETE pour l'utilisateur** (écriture uniquement via les 2 RPC `SECURITY DEFINER` à `search_path` fixé), lecture de SES demandes seulement, administrateur via `is_admin()`. `user_id` passe à NULL si le compte disparaît (traçabilité sans identifiant). SQL validé syntaxiquement (18 instructions). Aucune clé secrète dans `src/` ni dans `dist/` (recherche `service_role`, `CINETPAY_*`). Aucun numéro de carte n'est collecté ni stocké.

## Correctif hors périmètre (à valider visuellement)
`Header.tsx` (navbar hors accueil) **débordait horizontalement** pour un visiteur non connecté de 1024 à 1440 px (déjà avant cette passe, aussi sur `/help` et `/contact`). Correctif minimal, aucun lien supprimé : menu burger jusqu'à 1399 px, barre desktop dès 1400 px, AgriGuide dans la barre dès 2xl (et ajouté au footer), espacements resserrés. Avec une police Arial : 0 débordement de 360 à 1920 px. Avec la police de repli du bac à sable (plus large que Manrope) il reste 23–66 px entre 1400 et 1536 px : **vérifier avec Manrope réelle** à 1400–1536 px.

## Changement de comportement à connaître
Le thème et la langue ne sont plus mémorisés tant que l'utilisateur n'a pas accepté les cookies de préférences (le thème système reste respecté). C'est voulu, mais visible.

## Tests effectués (Chromium headless)
- **Consentement (28)** : 1ʳᵉ visite, tout accepter, refuser, personnaliser, modifier, retrait (purge thème/langue), retour sur le site, boutons égaux, cibles ≥ 44 px, clavier, piège du focus, Échap, restitution du focus, aucun cookie HTTP.
- **Pages (164)** : 6 pages × 7 largeurs (360, 390, 414, 768, 1024, 1280, 1440) sans débordement, 1 seul `h1`, titres SEO distincts, liens du footer, sommaire mobile/desktop, ancres, bouton Retour, tableaux→cartes, parcours Accueil→Footer→pages→Préférences.
- **Compte (55, Supabase simulé, 390 & 1280 px)** : affichage profil, export JSON sans secrets, requêtes bornées à l'utilisateur, confirmation, annulation, Échap, demande, statut persistant, annulation de demande, redirection si déconnecté.
- **Contraste WCAG AA** mesuré (clair + sombre) : 0 défaut sur les 5 pages, bannière, modale, section compte, boîte de suppression (7 défauts réels corrigés en cours de route).
- Non testé : Firefox/Safari, vrais appareils, vrai projet Supabase (RLS), police Manrope réelle.

## Éléments juridiques à valider avant production
Chaque point est affiché dans les pages par un encadré « TODO interne » ou « À configurer » :
1. Identité de l'éditeur / responsable du traitement (dénomination, adresse, n° d'enregistrement) — **rien n'a été inventé**.
2. Loi congolaise applicable à la protection des données, base juridique de chaque finalité, liste et délai des droits.
3. Durées de conservation par catégorie ; obligations de conservation (comptable, fiscale, litiges) avant toute suppression réelle.
4. Journaux techniques des prestataires (IP), région d'hébergement Supabase, transferts hors RDC.
5. **Numéro Mobile Money** de l'acheteur : lisible du producteur via les règles d'accès des paiements — décider s'il faut le masquer (minimisation).
6. Google Fonts (IP transmise) : auto-héberger la police ou le documenter.
7. Durée de validité du choix de consentement ; mode d'information lors d'un changement de politique/conditions.
8. Qualification d'AgriFlow (intermédiaire ou partie à la vente, paiements via son compte marchand CinetPay), limitation de responsabilité, garanties, litiges, droit applicable, âge minimum.
9. Suspension de compte (aucune fonction n'existe) : motifs, préavis, recours.
10. **Remboursement** : délai de réclamation, délai de traitement, frais, remboursement partiel, garantie commerciale, responsabilité produit non conforme — tous « À CONFIGURER ». L'écran « demander un remboursement » n'existe pas (la fonction serveur oui) : les réclamations passent par contact.
11. Commission d'AgriFlow et modalités de versement au producteur (valeur technique provisoire).
12. **Canal de contact officiel** : renseigner `VITE_CONTACT_EMAIL / PHONE / WHATSAPP / ADDRESS` (`.env.example`). Sans eux, les pages affichent un TODO au lieu de coordonnées.
13. Moyens de paiement réellement ouverts (dépend de la validation du compte CinetPay).
14. Mettre à jour `LEGAL_UPDATED_*` (`lib/legal/meta.ts`) à chaque modification de fond.
