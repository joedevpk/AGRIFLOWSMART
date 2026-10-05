# Passe 3 — Marketplace, produits, producteurs

## Nouveaux fichiers
- `src/lib/marketplace.ts` — puces, filtres (prix, quantité, disponibilité, localisation), recherche sans accents, disponibilité.
- `src/lib/image-upload.ts` — upload photos vers le bucket `product-images` (compression 1600 px, chemin `{user_id}/…`).
- `src/hooks/useDebouncedValue.ts` — debounce de la recherche (300 ms).
- `src/components/ui/SmartImage.tsx` — lazy loading, squelette, srcset, image de secours, alt obligatoire.
- `src/components/marketplace/` — `MarketplaceFilters` (puces + feuille mobile), `ContactProducer` (message via table `messages`), `MarketplaceStates` (MarketplaceSkeleton, ProductSkeleton, ProducerSkeleton, EmptyMarketplace, ProductError, ProducerError).

## Fichiers réécrits / modifiés
MarketplacePage, ProductDetailPage, ProducerProfilePage, ProducersPage, PublishProductPage, ProductCard, ProductGallery,
Button (`buttonStyles`, variante `harvest`), Avatar (lazy), MessagesPage (`?with=<user_id>`), LoginPage (retour à la page d'origine), image-config (`resizeImage`, `buildSrcSet`).

## Aucun changement
AuthContext, client Supabase, migrations SQL, RLS, routes.
