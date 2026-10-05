# Passe 8 — Refonte UI (brief « design premium »)

## Constat avant modification
Le projet respectait déjà l'essentiel du brief (hero photo, ProductCard image-first, marketplace, timeline commandes, layout auth split-screen, image-config centralisé, aucune donnée inventée). La passe cible donc les écarts réels, pas une réécriture.

## Modifié
- `tailwind.config.js` : palette alignée sur les hex du brief (Forest #163A24, Agriculture #2F6B3B, Fresh #5E9F45, Sage #A8C69F, Cream #F5F0E6, Off-white #FCFBF7, Charcoal #20251F, Harvest #E99A24) ; surfaces `night-*` pour le mode sombre.
- `src/index.css` : vrai mode sombre vert-noir (cartes surélevées) ; correction du texte `text-charcoal/N` (~170 usages illisibles en sombre) ; badges flottants du hero ; focus clavier ; `prefers-reduced-motion`.
- `Header.tsx` : navbar Marketplace · Producteurs · Acheteurs · Agri-Match · Comment ça marche, icône recherche, CTA « Vendre ma production » (masqué pour les acheteurs), état actif sur sous-routes, aria-labels, cibles tactiles 44 px ; footer forêt avec la phrase « Connecter ceux qui produisent avec ceux qui achètent. » (liens vers routes existantes uniquement).
- `AuthLayout.tsx` : bandeau image réduit sur mobile, grande image desktop, mode sombre.
- `Button.tsx` : hauteurs tactiles, retour au toucher, variante `sun` (CTA orange plein).
- `image-config.ts` : table `PAGE_IMAGES` (image par page).
- `translations.ts` (FR) : `nav.agrimatch`, `nav.sell`, `footer.forWho`, nouvelle accroche de pied de page.

## Vérifié réellement
`npm run typecheck` 0 erreur · `npm run lint` 0 erreur (6 avertissements react-refresh préexistants) · `npm run build` OK.

## NON vérifié / restant
- Aucun rendu navigateur ni capture d'écran (360→1440 px, mode sombre) : à contrôler à l'œil.
- Photos : ~19 photos Pexels distinctes, certaines réutilisées (cacao/marché, légumes/mangue…). Domaine Pexels inaccessible depuis cet environnement : aucune nouvelle photo n'a pu être ajoutée ni vérifiée. Manquent : agricultrices, producteurs congolais identifiables, images propres aux états vides.
- Pas de pages À propos / Contact / Conditions / Confidentialité / Paramètres (routes inexistantes : non créées pour éviter des liens morts).
- Agri-Match dans la navbar mène à `/buyer/requests` (la page exige une demande d'achat).
- Non refondus dans cette passe : pages Producteurs/Acheteurs, dashboards, commandes, fiche produit (déjà conformes dans leur structure, à auditer visuellement).
