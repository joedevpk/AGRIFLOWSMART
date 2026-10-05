# Passe 9 — Système d'images

## Audit (avant)
19 photos Pexels distinctes pour ~40 entrées : 10 photos rattachées à 2-4 rôles (cacao = marché, arachide = haricot, mangue = légumes, oignon = étal = acheteur, coopérative = champ = hero…). L'accueil affichait deux fois la même photo (hero et bannière finale). Alts affirmant « en Afrique » sans preuve.

## Fait
- `image-config.ts` : 1 URL = 1 rôle (0 doublon vérifié par script) ; catégories du brief ; `PAGE_IMAGES` (12 slots, photos toutes distinctes) ; `IMAGE_GAPS` (photos à sourcer) ; alts neutres sans lieu.
- Produits sans photo dédiée (cacao, arachide, mangue, oignon, patate douce, palmiste) : photo neutre « produits agricoles », plus la photo d'une autre culture.
- Pages rebranchées : Accueil (hero, marchés, producteurs, CTA final), Comment ça marche, Producteurs, Acheteurs ; Auth déjà sur `PAGE_IMAGES.auth`. Hero d'accueil : srcset + priorité de chargement ; images de sections en lazy.
- Signatures (`getProductImage`, etc.) inchangées : panier, commandes, publication non touchés.

## NON fait / à savoir
- Aucune nouvelle photo ajoutée : Pexels inaccessible ici, et je ne peux pas vérifier visuellement qu'une photo montre des personnes africaines ou un contexte RDC. Ne pas inventer d'ID. La liste `IMAGE_GAPS` dit quoi chercher.
- Les 19 photos existantes n'ont pas été revues à l'œil : leur contenu réel reste à confirmer.
- `object-position` non ajusté (pas de rendu pour repérer visages/produits) ; pas de test 360→1440 px.
- Pas de page À propos : la narration visuelle en 6 images n'a pas pu être créée.
