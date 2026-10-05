# Passe 21 — UI globale (2e passe : composants partagés, panier, Producteurs, Acheteurs, SEO)

## PASSE UI — TERMINÉE (partielle)

### Pages améliorées
- **Panier** : CTA « Passer au paiement » (mobile : « Payer »), confirmation « Vider le panier » via boîte de dialogue accessible (plus de `window.confirm`), titre SEO `noindex`.
- **Producteurs (`/producers`)** : devient la landing « Donnez plus de visibilité à votre production » (Publiez / Trouvez des acheteurs / Recevez des commandes / Gérez votre activité), CTA « Commencer à vendre » (visiteur) ou « Publier un produit » (vendeur connecté ; masqué pour un acheteur), bandeau final. L'annuaire réel des producteurs est conservé dessous (états chargement / vide / erreur + réessayer inchangés).
- **Acheteurs (`/buyers`)** : hero via `PageHero` (plus de hero dupliqué), bandeau final `CTASection`, SEO ajouté.
- **Suppressions** (mes produits, parcelle) : `ConfirmDialog` à la place de `window.confirm`.
- **SEO** : titre + description ajoutés à Producteurs (« Pour les producteurs | AgriFlow RDC »), Acheteurs, Panier, pages Auth (via `AuthLayout`, noindex) et pages dashboard (via `DashboardLayout`, noindex).

### Composants créés/modifiés
- Créé : `ui/ConfirmDialog.tsx` (focus piégé, Échap, retour du focus, focus initial sur « Annuler », état de chargement bloquant).
- Modifié : `institutional/blocks.tsx` — `CtaBand` délègue désormais à `CTASection` (un seul composant d'appel à l'action). `CTASection` est maintenant utilisé.
- Modifié : `AuthLayout`, `DashboardLayout` (SEO).

### Responsive / Accessibilité
- Boutons pleine largeur sur mobile dans les bandeaux, grilles 1→2→3 colonnes. `role="alertdialog"`, `aria-modal`, `aria-labelledby/describedby`. Aucune animation nouvelle (réutilise `animate-fade-in`, déjà soumis à `prefers-reduced-motion`).

### Fonctionnalités préservées
Routes, Supabase (requêtes inchangées, pas de nouvelle colonne demandée), RLS, panier/stock/vérifications, filtres. Aucune donnée, statistique, badge ou partenaire inventé (le badge « vérifié » reste conditionné à `is_verified`).

### Tests
- Typecheck : PASS
- Lint : PASS
- Build : PASS
- **Aucun test navigateur** n'a été effectué : rendu visuel, mode sombre et responsive (360 → 1920 px) non vérifiés visuellement.

### Pages restantes
Fiche produit (sticky CTA mobile déjà présent, à revoir visuellement), profil producteur, dashboards (sidebar existante), checkout, commandes (filtres/table), Agri-Match, AgriGuide, Ma Parcelle, Calendrier, Analyse terrain (route absente), Comment ça marche, Contact, Aide, Paramètres (route absente), Admin (3 `window.confirm` restants dans AdminPage, OrderDetailPage, OrderQuickActions à migrer vers `ConfirmDialog`), bouton Favori sur les cartes (aucune route Favoris).
