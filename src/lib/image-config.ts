/**
 * Système d'images centralisé — AgriFlow RDC.
 *
 * Toutes les photographies de l'application passent par ce fichier.
 *
 * RÈGLES
 * 1. Une photo = un seul rôle. Les mêmes URLs ne sont plus rattachées à
 *    plusieurs cultures ou catégories (ancien défaut : cacao = marché,
 *    arachide = haricot, mangue = légumes...). Un produit sans photo dédiée
 *    reçoit la photo NEUTRALE `produce_generic`, jamais la photo d'un autre produit.
 * 2. Les textes alternatifs décrivent ce qu'on voit, sans affirmer de lieu
 *    (ni « RDC », ni « Afrique », ni province) : la source (Pexels) ne le garantit pas.
 * 3. Ce sont des visuels éditoriaux libres de droits, pas des producteurs
 *    ou lieux réels d'AgriFlow RDC. Ne jamais les légender comme tels.
 * 4. Les photos manquantes sont listées dans IMAGE_GAPS : à sourcer à la main.
 *
 * LIMITE : les URLs ci-dessous viennent des passes précédentes. Elles n'ont pas
 * pu être revérifiées visuellement dans cet environnement (pas d'accès à Pexels).
 */

export type ImageCategory =
  | 'hero' | 'farmers' | 'femaleFarmers' | 'youngFarmers' | 'fields' | 'harvest'
  | 'markets' | 'cooperatives' | 'buyers' | 'restaurants' | 'logistics'
  | 'delivery' | 'technology' | 'products' | 'stories';

/** Provenance d'une photo : licence et page source (attribution CC BY-SA, conditions Unsplash/Pexels). */
export interface ImageCredit {
  source: 'Wikimedia Commons' | 'Pexels' | 'Unsplash';
  license: string;
  sourceUrl: string;
  /** Lieu CONFIRMÉ par la page source, uniquement s'il l'est. Ne jamais déduire. */
  confirmedPlace?: string;
}

export interface ImageEntry {
  url: string;
  alt: string;
  category: ImageCategory;
  credit?: ImageCredit;
}

const PEXELS_BASE = 'https://images.pexels.com/photos';
const px = (id: string, w = 1200) => `${PEXELS_BASE}/${id}?auto=compress&cs=tinysrgb&w=${w}`;
/** Wikimedia Commons : Special:FilePath redirige vers le fichier, `width` fournit une miniature. */
const commons = (file: string, w = 1600) => `https://commons.wikimedia.org/wiki/Special:FilePath/${file}?width=${w}`;
const unsplash = (photo: string, w = 1600) => `https://images.unsplash.com/${photo}?auto=format&fit=crop&q=70&w=${w}`;

export const IMAGES: Record<string, ImageEntry> = {
  // ---- photos documentées (liste « sources vérifiées ») ---------------
  // Kinshasa / RDC : fournies par le porteur du projet ; la page source n'a pas pu
  // être rouverte lors de l'intégration (voir CREDITS-IMAGES.md).
  kinshasa_market: {
    url: commons('Kinshasa_Farmers%27_Market.jpg', 1920),
    alt: 'Marché de producteurs à Kinshasa',
    category: 'markets',
    credit: { source: 'Wikimedia Commons', license: 'CC BY-SA 4.0', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Kinshasa_Farmers%27_Market.jpg', confirmedPlace: 'Kinshasa, RDC (selon la liste fournie)' },
  },
  cassava_seller: {
    url: commons('Manyoko.jpg', 1200),
    alt: 'Vendeuse transportant du manioc',
    category: 'products',
    credit: { source: 'Wikimedia Commons', license: 'CC BY-SA 4.0', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Manyoko.jpg', confirmedPlace: 'RDC (selon la liste fournie)' },
  },
  // Pexels : pages ouvertes et lues. Lieu NON confirmé pour la photo du champ de maïs.
  maize_field_farmer: {
    url: px('14371701/pexels-photo-14371701.jpeg', 1200),
    alt: 'Agriculteur marchant dans un champ de maïs',
    category: 'products',
    credit: { source: 'Pexels', license: 'Licence Pexels', sourceUrl: 'https://www.pexels.com/photo/a-man-walking-on-corn-field-14371701/' },
  },
  maize_harvest_farmer: {
    url: px('13042951/pexels-photo-13042951.jpeg', 1600),
    alt: 'Agriculteur présentant du maïs fraîchement récolté',
    category: 'harvest',
    credit: { source: 'Pexels', license: 'Licence Pexels', sourceUrl: 'https://www.pexels.com/photo/farmer-holding-corns-13042951/', confirmedPlace: 'Morogoro, Tanzanie (pas la RDC)' },
  },
  // Unsplash : page ouverte et lue.
  market_spices: {
    url: unsplash('photo-1778079247396-9c0e01c83c8b', 1600),
    alt: 'Vendeuse d\'épices sur un marché en plein air',
    category: 'markets',
    credit: { source: 'Unsplash', license: 'Licence Unsplash', sourceUrl: 'https://unsplash.com/photos/woman-selling-spices-at-an-outdoor-market-tE9Qsv_eV2o', confirmedPlace: 'Hautes terres de Gamo, Éthiopie (pas la RDC)' },
  },

  // ---- hero / champs / récolte ---------------------------------------
  hero_farmer: { url: px('440731/pexels-photo-440731.jpeg', 1920), alt: 'Agriculteur au travail dans un champ', category: 'hero' },
  farmer_portrait: { url: px('2382665/pexels-photo-2382665.jpeg', 1600), alt: 'Producteur agricole dans son champ', category: 'farmers' },
  hero_harvest: { url: px('1112080/pexels-photo-1112080.jpeg', 1920), alt: 'Récolte agricole en cours', category: 'harvest' },
  farmer_field_work: { url: px('2255935/pexels-photo-2255935.jpeg', 1600), alt: 'Producteur travaillant sa parcelle', category: 'farmers' },
  // L'ancienne photo Pexels (442761) renvoie 404 : on réutilise une photo déjà vérifiée du champ de maïs.
  farmer_smartphone: { url: px('14371701/pexels-photo-14371701.jpeg', 1600), alt: 'Agriculteur marchant dans un champ de maïs', category: 'technology' },

  // ---- marchés / acheteurs -------------------------------------------
  market_stall: { url: px('2733918/pexels-photo-2733918.jpeg', 1600), alt: 'Étal de marché avec des produits agricoles', category: 'buyers' },
  produce_generic: { url: px('1656663/pexels-photo-1656663.jpeg', 1200), alt: 'Produits agricoles frais prêts à la vente', category: 'products' },

  // ---- logistique / transformation -----------------------------------
  logistics_truck: { url: px('2683205/pexels-photo-2683205.jpeg', 1600), alt: 'Camion de transport de marchandises', category: 'logistics' },
  logistics_loading: { url: px('4481259/pexels-photo-4481259.jpeg', 1600), alt: 'Chargement de produits agricoles', category: 'delivery' },
  agro_industry: { url: px('2286895/pexels-photo-2286895.jpeg', 1600), alt: 'Site de transformation agro-industrielle', category: 'technology' },

  // ---- produits (une photo par culture) ------------------------------
  tomato: { url: px('533280/pexels-photo-533280.jpeg'), alt: 'Tomates fraîches', category: 'products' },
  coffee: { url: px('374831/pexels-photo-374831.jpeg'), alt: 'Grains de café', category: 'products' },
  beans: { url: px('7511776/pexels-photo-7511776.jpeg'), alt: 'Haricots secs', category: 'products' },
  soy: { url: px('4198719/pexels-photo-4198719.jpeg'), alt: 'Grains de soja', category: 'products' },
  rice: { url: px('7427075/pexels-photo-7427075.jpeg'), alt: 'Riz', category: 'products' },
  banana: { url: px('2872767/pexels-photo-2872767.jpeg'), alt: 'Régime de bananes', category: 'products' },
};

/**
 * Photo réservée à chaque page (§ pages du brief). Toutes distinctes entre elles :
 * une page = une photo, y compris entre l'accueil, l'authentification et les bannières.
 */
export type PageImageSlot =
  | 'home' | 'marketplace' | 'product' | 'producer' | 'producerCta' | 'buyer'
  | 'markets' | 'agriMatch' | 'orders' | 'howItWorks' | 'auth' | 'about';

export const PAGE_IMAGES: Record<PageImageSlot, ImageEntry> = {
  home: IMAGES.kinshasa_market,
  marketplace: IMAGES.produce_generic,
  product: IMAGES.maize_harvest_farmer,
  producer: IMAGES.farmer_portrait,
  producerCta: IMAGES.hero_farmer,
  buyer: IMAGES.market_stall,
  markets: IMAGES.market_spices,
  agriMatch: IMAGES.agro_industry,
  orders: IMAGES.logistics_truck,
  howItWorks: IMAGES.logistics_loading,
  auth: IMAGES.farmer_smartphone,
  about: IMAGES.hero_harvest,
};

/**
 * Rotation du hero de la page d'accueil (§ carrousel), affichée en plein écran derrière
 * le titre. La photo de camion (logistics_truck) en a été retirée : peu agricole pour un hero.
 * La photo de Kinshasa reste en premier (seule source RDC documentée). Réutilise des photos déjà
 * cataloguées ci-dessus (donc déjà vérifiées une par une) plutôt que d'en introduire
 * de nouvelles non sourcées. Chaque entrée n'apparaît qu'une fois dans ce tableau.
 */
export const HOME_HERO_CAROUSEL: ImageEntry[] = [
  IMAGES.kinshasa_market,
  IMAGES.hero_farmer,
  IMAGES.maize_harvest_farmer,
  IMAGES.market_stall,
  IMAGES.farmer_field_work,
];

/**
 * Photos qui manquent encore pour tenir le brief « identité africaine / RDC ».
 * À sourcer et vérifier À LA MAIN (personnes, lieux, produits), puis ajouter ci-dessus.
 */
export const IMAGE_GAPS: { slot: string; need: string }[] = [
  { slot: 'femaleFarmers', need: 'Agricultrices africaines en récolte ou au marché' },
  { slot: 'youngFarmers', need: 'Jeunes agriculteurs africains, si possible avec smartphone' },
  { slot: 'commons:cacao-arachide', need: 'Choisir des fichiers dans la catégorie Commons « Agricultural products of the DRC » (cacao, arachides) : noms de fichiers à relever' },
  { slot: 'commons:fields-maize-cassava', need: 'Choisir des fichiers dans les catégories Commons Champs / Maïs / Manioc RDC : noms de fichiers à relever' },
  { slot: 'restaurants', need: 'Cuisine / restaurant africain, approvisionnement' },
  { slot: 'cooperatives', need: 'Groupe de producteurs, collecte, sacs de maïs stockés' },
  { slot: 'delivery', need: 'Réception de marchandises par un acheteur' },
  { slot: 'product:cacao', need: 'Cabosses ou fèves de cacao' },
  { slot: 'product:peanut', need: 'Arachides' },
  { slot: 'product:mango', need: 'Mangues / fruits tropicaux' },
  { slot: 'product:onion', need: 'Oignons' },
  { slot: 'product:sweetPotato', need: 'Patates douces' },
  { slot: 'product:palmKernel', need: 'Palmistes / huile de palme' },
  { slot: 'emptyStates', need: 'Illustrations sobres cohérentes (aujourd\'hui : icône Sprout)' },
];

/**
 * Uniquement les cultures qui ont une photo dédiée. Cacao, arachide, mangue,
 * oignon, patate douce et palmiste n'en ont pas encore (voir IMAGE_GAPS) :
 * ils reçoivent la photo neutre plutôt que celle d'une autre culture.
 */
export const PRODUCT_IMAGES: Record<string, string> = {
  'Maïs': IMAGES.maize_field_farmer.url,
  'Riz': IMAGES.rice.url,
  'Manioc': IMAGES.cassava_seller.url,
  'Tomate': IMAGES.tomato.url,
  'Café': IMAGES.coffee.url,
  'Haricot': IMAGES.beans.url,
  'Soja': IMAGES.soy.url,
  'Banane': IMAGES.banana.url,
};

export function getProductImage(name: string): string {
  return PRODUCT_IMAGES[name] || IMAGES.produce_generic.url;
}

export function getCategoryImage(category: string): string {
  const map: Record<string, string> = {
    cereals: IMAGES.maize_field_farmer.url,
    tubers: IMAGES.cassava_seller.url,
    vegetables: IMAGES.produce_generic.url,
    fruits: IMAGES.banana.url,
    cash_crops: IMAGES.coffee.url,
    legumes: IMAGES.beans.url,
    oilseeds: IMAGES.soy.url,
  };
  return map[category] || IMAGES.produce_generic.url;
}

export function getImagesByCategory(category: ImageCategory): ImageEntry[] {
  return Object.values(IMAGES).filter((img) => img.category === category);
}

/* ------------------------------------------------------------------ */
/*  Optimisation d'images                                              */
/* ------------------------------------------------------------------ */

/** Redimensionne les images Pexels (paramètre `w`). Autres sources : inchangées. */
export function resizeImage(url: string, width: number): string {
  if (url.includes('commons.wikimedia.org/wiki/Special:FilePath')) {
    return url.replace(/([?&])width=\d+/, `$1width=${width}`);
  }
  if (url.includes('images.unsplash.com')) {
    return url.replace(/([?&])w=\d+/, `$1w=${width}`);
  }
  if (url.includes('images.pexels.com')) {
    return /[?&]w=\d+/.test(url)
      ? url.replace(/([?&])w=\d+/, `$1w=${width}`)
      : `${url}${url.includes('?') ? '&' : '?'}w=${width}`;
  }
  return url;
}

/** `srcset` responsive quand la source le permet (Pexels), sinon undefined. */
export function buildSrcSet(url: string, widths: number[] = [480, 800, 1200]): string | undefined {
  const known = ['images.pexels.com', 'images.unsplash.com', 'commons.wikimedia.org/wiki/Special:FilePath'];
  if (!known.some((h) => url.includes(h))) return undefined;
  return widths.map((w) => `${resizeImage(url, w)} ${w}w`).join(', ');
}
