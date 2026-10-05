/**
 * Base de connaissances AgriGuide — plages écologiques indicatives + fiches pédagogiques.
 *
 * Les plages (température, pluie, altitude, pH) sont des ORDRES DE GRANDEUR d'usage courant
 * (type base FAO EcoCrop) saisis à la main : ils doivent être validés par un agronome avant
 * usage en production. Les fiches donnent des principes GÉNÉRAUX, jamais une recommandation
 * personnalisée (doses, écartements et variétés dépendent du lieu et de la variété).
 */
export type SoilType = 'sablonneux' | 'limoneux' | 'argileux' | 'sablo-argileux' | 'humifere';
export const SOIL_LABELS: Record<SoilType, string> = {
  sablonneux: 'Sableux',
  limoneux: 'Limoneux',
  argileux: 'Argileux',
  'sablo-argileux': 'Sablo-argileux',
  humifere: 'Riche en humus',
};

export interface Range { optMin: number; optMax: number; absMin: number; absMax: number }

export type SowingRule = 'rain_start' | 'dry_irrigated' | 'perennial';

export const STEP_KEYS = [
  'presentation', 'terrain', 'semences', 'semis', 'entretien',
  'fertilisation', 'surveillance', 'recolte', 'stockage', 'commercialisation',
] as const;
export type StepKey = (typeof STEP_KEYS)[number];

export const STEP_TITLES: Record<StepKey, string> = {
  presentation: 'Présentation',
  terrain: 'Préparation du terrain',
  semences: 'Choix des semences',
  semis: 'Semis / plantation',
  entretien: 'Entretien',
  fertilisation: 'Fertilisation',
  surveillance: 'Surveillance',
  recolte: 'Récolte',
  stockage: 'Stockage',
  commercialisation: 'Commercialisation',
};

export interface Crop {
  id: string;
  name: string;
  emoji: string;
  category: 'céréale' | 'racine' | 'légume' | 'légumineuse' | 'fruit' | 'culture pérenne';
  /** Nom utilisé pour rapprocher avec les offres/demandes du marché (Agri-Match). */
  marketName: string;
  temp: Range;
  rain: Range;
  alt: Range;
  ph: Range;
  soilPrefer: SoilType[];
  soilTolerate: SoilType[];
  /** Culture fortement dépendante d'un apport d'eau maîtrisé. */
  waterSensitive: boolean;
  sowing: SowingRule;
  /** Durée semis/plantation → première récolte, en jours (ordre de grandeur, dépend de la variété). */
  cycleDays: [number, number];
  cycleLabel: string;
  summary: string;
  caution?: string;
  steps: Record<StepKey, string>;
}

const R = (optMin: number, optMax: number, absMin: number, absMax: number): Range => ({ optMin, optMax, absMin, absMax });
const COMMERCE =
  'Avant la récolte, publiez votre production sur AgriFlow (quantité, qualité, date de disponibilité) : les acheteurs qui la recherchent sont mis en relation avec vous par Agri-Match.';

export const CROPS: Crop[] = [
  {
    id: 'mais', name: 'Maïs', emoji: '🌽', category: 'céréale', marketName: 'Maïs',
    temp: R(18, 30, 10, 36), rain: R(600, 1200, 400, 1800), alt: R(0, 1800, 0, 2500), ph: R(5.8, 7.0, 5.0, 8.0),
    soilPrefer: ['limoneux', 'sablo-argileux'], soilTolerate: ['humifere', 'argileux'],
    waterSensitive: false, sowing: 'rain_start', cycleDays: [90, 130], cycleLabel: 'environ 3 à 4 mois selon la variété',
    summary: 'Céréale de base, cultivée pour la consommation et la vente. Sensible au manque d\'eau à la floraison.',
    steps: {
      presentation: 'Culture de cycle court à moyen. Le calendrier de semis dépend du début des pluies dans votre zone.',
      terrain: 'Débroussailler, nettoyer et ameublir le sol. Éviter les endroits où l\'eau stagne. Prévoir la préparation avant l\'arrivée des pluies.',
      semences: 'Choisir des semences saines, de variétés adaptées à votre zone. Renseignez-vous auprès du service agricole local ou de l\'INERA sur les variétés disponibles.',
      semis: 'Semer au début de la saison des pluies, quand le sol est bien humide, en lignes régulières pour faciliter l\'entretien.',
      entretien: 'Désherber tôt : les mauvaises herbes concurrencent fortement le maïs les premières semaines. Compléter les manquants si nécessaire.',
      fertilisation: 'Le maïs est exigeant en éléments nutritifs. Les apports (fumure organique, engrais) dépendent du sol : faites-vous conseiller localement plutôt que d\'appliquer une dose générique.',
      surveillance: 'Observer régulièrement les feuilles et les épis. En cas de doute sur un ravageur ou une maladie, demandez l\'avis d\'un technicien agricole.',
      recolte: 'Récolter quand les grains sont mûrs et les spathes sèches. Éviter de laisser les épis longtemps au champ sous la pluie.',
      stockage: 'Bien sécher les grains avant stockage : l\'humidité favorise les moisissures et les insectes. Stocker à l\'abri de l\'humidité et des rongeurs.',
      commercialisation: COMMERCE,
    },
  },
  {
    id: 'manioc', name: 'Manioc', emoji: '🌱', category: 'racine', marketName: 'Manioc',
    temp: R(20, 29, 15, 35), rain: R(1000, 1500, 600, 2500), alt: R(0, 1200, 0, 1800), ph: R(5.0, 7.0, 4.5, 8.0),
    soilPrefer: ['sablo-argileux', 'limoneux', 'sablonneux'], soilTolerate: ['humifere'],
    waterSensitive: false, sowing: 'perennial', cycleDays: [270, 540], cycleLabel: 'environ 9 à 18 mois selon la variété',
    summary: 'Culture vivrière à cycle long, tolérante à des sols pauvres. Ne supporte pas l\'eau qui stagne.',
    caution: 'Certaines variétés de manioc sont amères : la transformation (rouissage, séchage) est essentielle avant consommation.',
    steps: {
      presentation: 'Culture de cycle long, plantée par boutures de tiges. Elle valorise des sols pauvres mais craint les sols détrempés.',
      terrain: 'Défricher et ameublir le sol ; préférer un terrain bien drainé. Des buttes ou billons peuvent aider dans les sols lourds.',
      semences: 'Utiliser des boutures saines, prélevées sur des plants vigoureux et non malades. Les variétés améliorées sont à demander aux services agricoles.',
      semis: 'Planter les boutures au début des pluies, en respectant le sens des bourgeons.',
      entretien: 'Désherber surtout pendant les premiers mois, jusqu\'à ce que le feuillage couvre le sol.',
      fertilisation: 'Le manioc répond à la fertilité du sol mais tolère des sols modestes. Les apports dépendent de votre terrain : demandez conseil.',
      surveillance: 'Surveiller l\'apparition de feuilles déformées ou mosaïquées et signaler les cas suspects à un technicien agricole.',
      recolte: 'Récolte échelonnée possible après plusieurs mois ; le moment dépend de la variété et de vos besoins. Récolter avec soin pour ne pas abîmer les racines.',
      stockage: 'Les racines fraîches se conservent mal : transformez-les ou vendez-les rapidement (cossettes, farine, chikwangue).',
      commercialisation: COMMERCE,
    },
  },
  {
    id: 'tomate', name: 'Tomate', emoji: '🍅', category: 'légume', marketName: 'Tomate',
    temp: R(18, 27, 10, 32), rain: R(600, 1300, 400, 2000), alt: R(0, 1600, 0, 2200), ph: R(6.0, 6.8, 5.5, 7.5),
    soilPrefer: ['limoneux', 'humifere', 'sablo-argileux'], soilTolerate: ['argileux', 'sablonneux'],
    waterSensitive: true, sowing: 'dry_irrigated', cycleDays: [90, 130], cycleLabel: 'environ 3 à 4 mois, pépinière comprise',
    summary: 'Légume-fruit à forte valeur, exigeant en eau régulière et en suivi sanitaire.',
    steps: {
      presentation: 'Culture rémunératrice mais fragile : l\'eau régulière et la surveillance des maladies font la différence.',
      terrain: 'Choisir un sol fertile, bien drainé, avec accès à l\'eau. Éviter de replanter des tomates au même endroit plusieurs cycles de suite.',
      semences: 'Choisir des semences de variétés adaptées à votre zone (résistance aux maladies, fermeté pour le transport). Demandez conseil aux fournisseurs agréés.',
      semis: 'Semer en pépinière, puis repiquer les jeunes plants quand ils sont assez vigoureux, de préférence aux heures fraîches.',
      entretien: 'Arroser régulièrement (irrégularité = fruits abîmés), désherber, tuteurer les plants si la variété le demande.',
      fertilisation: 'Apports de matière organique et d\'engrais selon le sol et la variété. Les doses sont à définir avec un conseiller.',
      surveillance: 'Inspecter souvent feuilles et fruits. Les maladies progressent vite en période humide : agissez tôt avec l\'aide d\'un technicien.',
      recolte: 'Récolter à maturité adaptée à la distance de vente : plus tôt pour un long transport. Manipuler avec précaution.',
      stockage: 'Tomate fragile : stocker à l\'ombre, aérer, trier les fruits abîmés. Vendre rapidement.',
      commercialisation: COMMERCE,
    },
  },
  {
    id: 'riz', name: 'Riz', emoji: '🌾', category: 'céréale', marketName: 'Riz',
    temp: R(22, 30, 16, 35), rain: R(1000, 2000, 800, 3000), alt: R(0, 1000, 0, 2000), ph: R(5.5, 7.0, 4.5, 8.0),
    soilPrefer: ['argileux', 'limoneux'], soilTolerate: ['humifere', 'sablo-argileux'],
    waterSensitive: true, sowing: 'rain_start', cycleDays: [100, 160], cycleLabel: 'environ 3,5 à 5,5 mois selon la variété',
    summary: 'Céréale pluviale (riz de plateau) ou de bas-fond. Besoin en eau élevé et régulier.',
    steps: {
      presentation: 'Le riz peut être cultivé en riz pluvial (plateau) ou en bas-fond selon l\'eau disponible.',
      terrain: 'Préparer le sol et, en bas-fond, aménager de petites diguettes pour maîtriser l\'eau.',
      semences: 'Choisir des variétés adaptées au type de culture (plateau ou bas-fond), auprès des services agricoles.',
      semis: 'Semer en début de saison des pluies, en poquets ou en lignes ; ou repiquer en bas-fond.',
      entretien: 'Désherber régulièrement et gérer l\'eau selon le mode de culture.',
      fertilisation: 'Les besoins varient selon le sol et la variété ; demandez conseil pour les apports.',
      surveillance: 'Surveiller oiseaux, insectes et maladies des feuilles ; protéger les champs à la maturité.',
      recolte: 'Récolter à maturité des panicules, sécher rapidement après la coupe.',
      stockage: 'Sécher jusqu\'à un niveau d\'humidité sûr avant stockage ; conserver à l\'abri de l\'humidité et des rongeurs.',
      commercialisation: COMMERCE,
    },
  },
  {
    id: 'haricot', name: 'Haricot', emoji: '🫘', category: 'légumineuse', marketName: 'Haricot',
    temp: R(16, 24, 10, 30), rain: R(500, 1200, 300, 1800), alt: R(500, 2000, 0, 2500), ph: R(6.0, 7.0, 5.0, 7.8),
    soilPrefer: ['limoneux', 'sablo-argileux', 'humifere'], soilTolerate: ['sablonneux'],
    waterSensitive: false, sowing: 'rain_start', cycleDays: [60, 100], cycleLabel: 'environ 2 à 3,5 mois selon la variété',
    summary: 'Légumineuse de cycle court, riche en protéines, appréciée sur les marchés locaux.',
    steps: {
      presentation: 'Culture rapide, souvent associée ou alternée avec d\'autres cultures. Elle n\'aime ni la chaleur excessive ni l\'excès d\'eau.',
      terrain: 'Préparer un sol meuble et bien drainé, sans eau stagnante.',
      semences: 'Utiliser des graines saines et propres, de variétés adaptées à l\'altitude de votre zone.',
      semis: 'Semer au début des pluies, à faible profondeur, en lignes.',
      entretien: 'Désherber avec précaution pour ne pas abîmer les racines superficielles.',
      fertilisation: 'La plante fixe une partie de l\'azote ; les autres apports dépendent du sol. Demandez conseil.',
      surveillance: 'Observer feuilles et gousses ; signaler rouille, taches ou pucerons à un technicien agricole.',
      recolte: 'Récolter quand les gousses sont sèches, par temps sec, pour limiter les pertes.',
      stockage: 'Bien sécher les grains, les protéger des charançons (contenants fermés, local sec).',
      commercialisation: COMMERCE,
    },
  },
  {
    id: 'arachide', name: 'Arachide', emoji: '🥜', category: 'légumineuse', marketName: 'Arachide',
    temp: R(22, 28, 15, 34), rain: R(500, 1100, 400, 1600), alt: R(0, 1200, 0, 1600), ph: R(5.8, 7.0, 5.0, 7.5),
    soilPrefer: ['sablonneux', 'sablo-argileux'], soilTolerate: ['limoneux'],
    waterSensitive: false, sowing: 'rain_start', cycleDays: [90, 130], cycleLabel: 'environ 3 à 4,5 mois selon la variété',
    summary: 'Légumineuse-oléagineuse qui aime les sols légers et bien drainés.',
    steps: {
      presentation: 'Culture de sols légers ; les gousses se forment sous terre, d\'où l\'importance d\'un sol meuble.',
      terrain: 'Préparer un sol meuble, léger et sans eau stagnante.',
      semences: 'Choisir des graines saines, décortiquées avec soin peu avant le semis. Variétés à choisir selon votre zone.',
      semis: 'Semer au début des pluies, en lignes régulières.',
      entretien: 'Désherber tôt et butter légèrement au moment recommandé pour la variété.',
      fertilisation: 'Besoins modérés ; adaptez selon le sol avec un conseiller.',
      surveillance: 'Observer les taches sur les feuilles et les attaques d\'insectes ; demander conseil au besoin.',
      recolte: 'Arracher quand les gousses sont mûres, par sol non détrempé.',
      stockage: 'Sécher complètement avant stockage : les graines humides développent des moisissures nuisibles. Stocker au sec.',
      commercialisation: COMMERCE,
    },
  },
  {
    id: 'legumes', name: 'Légumes-feuilles et maraîchage', emoji: '🥬', category: 'légume', marketName: 'Légumes',
    temp: R(18, 28, 10, 35), rain: R(600, 1500, 400, 2500), alt: R(0, 1800, 0, 2200), ph: R(6.0, 7.0, 5.5, 7.5),
    soilPrefer: ['limoneux', 'humifere', 'sablo-argileux'], soilTolerate: ['argileux'],
    waterSensitive: true, sowing: 'dry_irrigated', cycleDays: [30, 75], cycleLabel: 'environ 1 à 2,5 mois selon le légume',
    summary: 'Cultures de cycle court (amarante, oseille, aubergine, etc.), proches des marchés urbains, qui demandent un arrosage régulier.',
    steps: {
      presentation: 'Le maraîchage est une production rapide, adaptée aux petites parcelles proches des villes.',
      terrain: 'Aménager des planches ou billons, enrichis de matière organique, avec un accès à l\'eau proche.',
      semences: 'Choisir des semences propres et adaptées à la saison ; privilégier les fournisseurs fiables.',
      semis: 'Semer en pépinière ou en place selon l\'espèce ; échelonner les semis pour avoir des récoltes régulières.',
      entretien: 'Arroser régulièrement, désherber, éclaircir si nécessaire.',
      fertilisation: 'La matière organique bien décomposée est très utile. Les autres apports dépendent du sol.',
      surveillance: 'Inspecter souvent : les insectes et les maladies progressent vite sur les cultures de cycle court.',
      recolte: 'Récolter aux heures fraîches, à maturité de vente, en manipulant avec soin.',
      stockage: 'Produits très périssables : vendre le jour même si possible ; à défaut, garder à l\'ombre et au frais.',
      commercialisation: COMMERCE,
    },
  },
  {
    id: 'banane', name: 'Banane', emoji: '🍌', category: 'fruit', marketName: 'Banane',
    temp: R(22, 30, 15, 35), rain: R(1200, 2500, 900, 3500), alt: R(0, 1200, 0, 2000), ph: R(5.5, 7.0, 4.5, 8.0),
    soilPrefer: ['limoneux', 'humifere'], soilTolerate: ['sablo-argileux', 'argileux'],
    waterSensitive: true, sowing: 'perennial', cycleDays: [270, 450], cycleLabel: 'environ 9 à 15 mois jusqu\'au premier régime',
    summary: 'Culture pérenne (bananier plantain ou dessert), exigeante en eau et en matière organique.',
    steps: {
      presentation: 'Culture qui produit toute l\'année une fois installée ; elle demande de l\'eau et un sol riche.',
      terrain: 'Choisir un sol profond et bien drainé, préparer des trous de plantation.',
      semences: 'Utiliser des rejets sains issus de plants vigoureux, ou des vitroplants auprès de fournisseurs fiables.',
      semis: 'Planter au début des pluies, avec des espacements adaptés à la variété.',
      entretien: 'Désherber, pailler pour conserver l\'humidité, supprimer les rejets en surnombre.',
      fertilisation: 'Le bananier consomme beaucoup de matière organique ; adaptez les apports au sol avec un conseiller.',
      surveillance: 'Surveiller les feuilles jaunies ou tachetées et les attaques de charançons ; demandez un avis technique si des plants dépérissent.',
      recolte: 'Récolter les régimes à maturité adaptée à la vente, avec précaution pour éviter les blessures.',
      stockage: 'Fruits périssables : à l\'ombre, aérés, vendre rapidement.',
      commercialisation: COMMERCE,
    },
  },
  {
    id: 'cafe', name: 'Café', emoji: '☕', category: 'culture pérenne', marketName: 'Café',
    temp: R(18, 26, 14, 30), rain: R(1200, 2000, 900, 2800), alt: R(600, 1800, 0, 2200), ph: R(5.0, 6.5, 4.5, 7.0),
    soilPrefer: ['humifere', 'limoneux'], soilTolerate: ['sablo-argileux'],
    waterSensitive: false, sowing: 'perennial', cycleDays: [1000, 1500], cycleLabel: 'environ 3 à 4 ans avant les premières récoltes',
    summary: 'Culture pérenne d\'exportation. Arabica en altitude, robusta plus bas : le choix dépend de votre zone.',
    caution: 'Investissement de long terme : renseignez-vous auprès des services agricoles ou de coopératives avant de planter.',
    steps: {
      presentation: 'Le café demande de la patience : plusieurs années avant la première récolte.',
      terrain: 'Choisir un site adapté à l\'espèce (altitude), avec sol profond et drainé ; prévoir de l\'ombrage selon les pratiques locales.',
      semences: 'Utiliser des plants issus de pépinières fiables, de variétés adaptées à votre zone.',
      semis: 'Planter les jeunes plants au début des pluies.',
      entretien: 'Désherber, tailler selon les pratiques recommandées, protéger les jeunes plants.',
      fertilisation: 'Les apports dépendent du sol et de l\'âge des caféiers ; demandez conseil.',
      surveillance: 'Observer feuilles et cerises ; signaler toute maladie inhabituelle à un technicien.',
      recolte: 'Récolter les cerises mûres, en plusieurs passages.',
      stockage: 'Séchage soigné, puis stockage au sec et aéré pour préserver la qualité.',
      commercialisation: COMMERCE + ' Les circuits d\'exportation ont leurs propres exigences de qualité.',
    },
  },
  {
    id: 'cacao', name: 'Cacao', emoji: '🍫', category: 'culture pérenne', marketName: 'Cacao',
    temp: R(22, 28, 18, 32), rain: R(1500, 2500, 1200, 3000), alt: R(0, 600, 0, 1000), ph: R(5.5, 7.0, 4.5, 7.5),
    soilPrefer: ['humifere', 'limoneux'], soilTolerate: ['sablo-argileux'],
    waterSensitive: true, sowing: 'perennial', cycleDays: [1000, 1800], cycleLabel: 'environ 3 à 5 ans avant les premières récoltes',
    summary: 'Culture pérenne des zones chaudes et humides, souvent sous ombrage.',
    caution: 'Investissement de long terme : renseignez-vous auprès des services agricoles ou de coopératives avant de planter.',
    steps: {
      presentation: 'Le cacaoyer demande un climat chaud et humide, et plusieurs années avant de produire.',
      terrain: 'Choisir un sol profond et humifère ; prévoir l\'ombrage des jeunes plants.',
      semences: 'Utiliser des plants de pépinières fiables, de variétés adaptées.',
      semis: 'Planter au début des pluies, avec des espacements adaptés.',
      entretien: 'Désherber, tailler et gérer l\'ombrage selon les pratiques recommandées.',
      fertilisation: 'Les apports dépendent du sol ; demandez conseil.',
      surveillance: 'Observer les cabosses ; signaler pourritures ou attaques d\'insectes à un technicien.',
      recolte: 'Récolter les cabosses mûres à la machette avec précaution, sans blesser les coussinets floraux.',
      stockage: 'Fermentation et séchage soignés, puis stockage au sec pour préserver la qualité.',
      commercialisation: COMMERCE + ' Les circuits d\'exportation ont leurs propres exigences de qualité.',
    },
  },
];

export function getCrop(id: string | null | undefined): Crop | undefined {
  return CROPS.find((c) => c.id === id);
}

/** Rapproche un nom libre (ex. « Maïs jaune », « maïs ») d'une culture connue. */
export function findCropByName(text: string | null | undefined): Crop | undefined {
  if (!text) return undefined;
  const t = text.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return CROPS.find((c) => {
    const n = c.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const m = c.marketName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return t === c.id || t.startsWith(n) || t.startsWith(m) || n.startsWith(t);
  });
}

export const CROPS_SOURCE =
  'Plages écologiques d\'ordre de grandeur (type FAO EcoCrop) et principes agronomiques généraux (FAO, services de vulgarisation). Valeurs indicatives, à valider avec un conseiller agricole ou l\'INERA.';

export const GENERAL_TIPS: { title: string; text: string }[] = [
  { title: 'Demandez l\'avis d\'un technicien local', text: 'Les conditions changent d\'un village à l\'autre : le service agricole, l\'INERA ou une coopérative peuvent confirmer variétés, dates et doses.' },
  { title: 'Notez ce que vous faites', text: 'Dates de semis, apports, problèmes rencontrés : ces notes vous aident à progresser d\'un cycle à l\'autre. Utilisez les notes de « Ma parcelle ».' },
  { title: 'Échelonnez vos productions', text: 'Semer en plusieurs fois étale les récoltes et facilite la vente régulière aux acheteurs.' },
  { title: 'Pensez à la vente avant la récolte', text: 'Publier votre production à l\'avance sur AgriFlow permet de trouver des acheteurs avant que le produit ne soit périssable.' },
  { title: 'Soignez le séchage et le stockage', text: 'Une grande partie des pertes après récolte vient d\'un mauvais séchage ou d\'un stockage humide.' },
  { title: 'Protégez l\'eau et le sol', text: 'Couvrir le sol (paillage), éviter l\'érosion et économiser l\'eau protègent votre parcelle sur le long terme.' },
];
