/**
 * Système de traduction — AgriFlow RDC.
 *
 * Langues disponibles : le français (langue officielle / administrative)
 * et les quatre langues nationales de la République démocratique du Congo :
 * le lingala, le kikongo, le kiswahili et le tshiluba.
 *
 * L'infrastructure (contexte, hook `useLanguage`, persistance) couvre toute
 * l'application ; le dictionnaire ci-dessous traduit en priorité les zones
 * communes à toutes les pages (navigation, pied de page, accueil, recherche)
 * afin d'être étendu progressivement écran par écran.
 */

import { P23_FR, P23_SW } from './passe23';

export type LanguageCode = 'fr' | 'ln' | 'kg' | 'sw' | 'lu';

export interface LanguageMeta {
  code: LanguageCode;
  label: string;
  nativeLabel: string;
  flagEmoji: string;
}

export const LANGUAGES: LanguageMeta[] = [
  { code: 'fr', label: 'Français', nativeLabel: 'Français', flagEmoji: '🇨🇩' },
  { code: 'ln', label: 'Lingala', nativeLabel: 'Lingála', flagEmoji: '🇨🇩' },
  { code: 'kg', label: 'Kikongo', nativeLabel: 'Kikongo', flagEmoji: '🇨🇩' },
  { code: 'sw', label: 'Kiswahili', nativeLabel: 'Kiswahili', flagEmoji: '🇨🇩' },
  { code: 'lu', label: 'Tshiluba', nativeLabel: 'Tshiluba', flagEmoji: '🇨🇩' },
];

export type TranslationDict = Record<string, string>;

export const TRANSLATIONS: Record<LanguageCode, TranslationDict> = {
  fr: {
    ...P23_FR,
    'nav.home': 'Accueil',
    'nav.marketplace': 'Marketplace',
    'nav.howItWorks': 'Comment ça marche',
    'nav.producers': 'Producteurs',
    'nav.buyers': 'Acheteurs',
    'nav.agrimatch': 'Agri-Match',
    'nav.sell': 'Vendre ma production',
    'nav.forProducers': 'Pour les producteurs',
    'nav.forEnterprises': 'Pour les entreprises',
    'nav.start': 'Commencer',
    'nav.search': 'Rechercher',
    'nav.connection': 'Connexion',
    'nav.dashboard': 'Tableau de bord',
    'nav.profile': 'Mon profil',
    'nav.login': 'Se connecter',
    'nav.register': 'Créer un compte',
    'nav.logout': 'Déconnexion',
    'nav.account': 'Mon compte',
    'lang.switch': 'Langue',
    'theme.switch': 'Thème',
    'theme.light': 'Clair',
    'theme.dark': 'Sombre',
    'hero.badge': 'MISE EN RELATION DIRECTE · RDC',
    'hero.title': 'Du producteur au marché, simplement.',
    'hero.subtitle': "AgriFlow connecte les producteurs, coopératives et acheteurs pour vendre et s'approvisionner plus simplement — sans intermédiaires.",
    'hero.ctaPrimary': 'Explorer les produits',
    'hero.ctaSecondary': 'Vendre ma production',
    'hero.statFarmers': 'Producteurs',
    'hero.statProducts': 'Productions',
    'hero.statBuyers': 'Acheteurs',
    'hero.statOrders': 'Commandes',
    'search.heading': 'Que recherchez-vous aujourd\u2019hui ?',
    'search.placeholder': 'Rechercher un produit (maïs, manioc, cacao...)',
    'search.button': 'Rechercher',
    'footer.tagline': 'Connecter ceux qui produisent avec ceux qui achètent.',
    'footer.forWho': 'Pour qui',
    'footer.platform': 'Plateforme',
    'footer.account': 'Compte',
    'footer.about': 'À propos',
    'footer.aboutText': 'AgriFlow RDC : plateforme numérique de mise en relation directe entre producteurs agricoles et acheteurs en RDC. Paiement sécurisé via CinetPay ou à la livraison.',
    'footer.demoData': 'Paiements sécurisés par CinetPay (Mobile Money, carte) ou réglés à la livraison.',
    'common.viewAll': 'Voir tout',
    'common.viewDetails': 'Voir les détails',
    'common.contact': 'Contacter',
    'common.available': 'Disponible',
    'common.retry': 'Réessayer',
    'common.loading': 'Chargement...',
  },
  ln: {
    'nav.home': 'Ekomelo',
    'nav.marketplace': 'Zando',
    'nav.howItWorks': 'Ndenge esalemaka',
    'nav.producers': 'Basali-bilanga',
    'nav.buyers': 'Basombi',
    'nav.dashboard': 'Tableau ya mosala',
    'nav.profile': 'Profil na ngai',
    'nav.login': 'Kokota',
    'nav.register': 'Kofungola compte',
    'nav.logout': 'Kobima',
    'nav.account': 'Compte na ngai',
    'lang.switch': 'Monoko',
    'theme.switch': 'Style',
    'theme.light': 'Pole',
    'theme.dark': 'Molili',
    'hero.badge': 'AGRITECH RDC',
    'hero.title': 'Longwa na mosali-bilanga tii na zando.',
    'hero.subtitle': 'AgriFlow ekangisaka basali-bilanga, ba coopérative na basombi mpo ete báteka mpe básomba na pete — kozanga bato ya kati.',
    'hero.ctaPrimary': 'Luka biloko',
    'hero.ctaSecondary': 'Teka bilanga na ngai',
    'hero.statFarmers': 'Basali-bilanga',
    'hero.statProducts': 'Bilanga',
    'hero.statBuyers': 'Basombi',
    'hero.statOrders': 'Ba commande',
    'search.heading': 'Ozali koluka nini lelo?',
    'search.placeholder': 'Luka eloko (masangu, mbala, kakawo...)',
    'search.button': 'Koluka',
    'footer.tagline': 'Longwa na mosali-bilanga tii na zando.',
    'footer.platform': 'Plateforme',
    'footer.account': 'Compte',
    'footer.about': 'Na ntina na biso',
    'footer.aboutText': 'AgriFlow RDC — Longwa na mosali tii na zando, na pete.',
    'footer.demoData': 'Kofuta na Mobile Money, na karte, to na ntango ya kozwa biloko.',
    'common.viewAll': 'Mona nyonso',
    'common.viewDetails': 'Mona ba détails',
    'common.contact': 'Kosolola',
    'common.available': 'Ezali',
    'common.retry': 'Meka lisusu',
    'common.loading': 'Ezali kotambola...',
  },
  kg: {
    'nav.home': 'Kunzila',
    'nav.marketplace': 'Zandu',
    'nav.howItWorks': 'Buevo besalanga',
    'nav.producers': 'Bansadi-bilanga',
    'nav.buyers': 'Basumbi',
    'nav.dashboard': 'Mesa ya kisalu',
    'nav.profile': 'Profil ya mono',
    'nav.login': 'Kota',
    'nav.register': 'Sala compte',
    'nav.logout': 'Basika',
    'nav.account': 'Compte ya mono',
    'lang.switch': 'Ndinga',
    'theme.switch': 'Mbonga',
    'theme.light': 'Nlangu',
    'theme.dark': 'Nfinda',
    'hero.badge': 'AGRITECH RDC',
    'hero.title': 'Tuka kwa nsadi-bilanga nate ku zandu.',
    'hero.subtitle': 'AgriFlow ke fukumisa bansadi-bilanga, ba coopérative ye basumbi mpo na kuteka ye kusumba na mpasi ve — kukonda bantu ya kati.',
    'hero.ctaPrimary': 'Vava bima',
    'hero.ctaSecondary': 'Teka bilanga na mono',
    'hero.statFarmers': 'Bansadi-bilanga',
    'hero.statProducts': 'Bilanga',
    'hero.statBuyers': 'Basumbi',
    'hero.statOrders': 'Ba commande',
    'search.heading': 'Nki wu ke vava lelo?',
    'search.placeholder': 'Vava kima (masangu, luku, cacao...)',
    'search.button': 'Vava',
    'footer.tagline': 'Tuka kwa nsadi-bilanga nate ku zandu.',
    'footer.platform': 'Plateforme',
    'footer.account': 'Compte',
    'footer.about': 'Mu yeto beto',
    'footer.aboutText': 'AgriFlow RDC — Kutuka ku mudimuki too ku mbulu, na buepiepi.',
    'footer.demoData': 'Difuta ne Mobile Money, ne karte, anyi pa kupeta biuma.',
    'common.viewAll': 'Mona yonso',
    'common.viewDetails': 'Mona ba détails',
    'common.contact': 'Solula',
    'common.available': 'Kele',
    'common.retry': 'Meka diaka',
    'common.loading': 'Ke tambula...',
  },
  sw: {
    ...P23_SW,
    'nav.home': 'Nyumbani',
    'nav.marketplace': 'Sokoni',
    'nav.howItWorks': 'Jinsi inavyofanya kazi',
    'nav.producers': 'Wakulima',
    'nav.buyers': 'Wanunuzi',
    'nav.dashboard': 'Dashibodi',
    'nav.profile': 'Wasifu wangu',
    'nav.login': 'Ingia',
    'nav.register': 'Fungua akaunti',
    'nav.logout': 'Toka',
    'nav.account': 'Akaunti yangu',
    'lang.switch': 'Lugha',
    'theme.switch': 'Mandhari',
    'theme.light': 'Angavu',
    'theme.dark': 'Giza',
    'hero.badge': 'AGRITECH DRC',
    'hero.title': 'Kutoka kwa mkulima moja kwa moja sokoni.',
    'hero.subtitle': 'AgriFlow inaunganisha wakulima, vyama vya ushirika na wanunuzi ili kuuza na kununua kwa urahisi — bila wapatanishi.',
    'hero.ctaPrimary': 'Tafuta bidhaa',
    'hero.ctaSecondary': 'Uza mazao yangu',
    'hero.statFarmers': 'Wakulima',
    'hero.statProducts': 'Mazao',
    'hero.statBuyers': 'Wanunuzi',
    'hero.statOrders': 'Maagizo',
    'search.heading': 'Unatafuta nini leo?',
    'search.placeholder': 'Tafuta bidhaa (mahindi, muhogo, kakao...)',
    'search.button': 'Tafuta',
    'footer.tagline': 'Kutoka kwa mkulima moja kwa moja sokoni.',
    'footer.platform': 'Jukwaa',
    'footer.account': 'Akaunti',
    'footer.about': 'Kuhusu',
    'footer.aboutText': 'AgriFlow RDC — Kutoka kwa mkulima hadi sokoni, kwa urahisi.',
    'footer.demoData': 'Malipo salama kwa Mobile Money, kadi, au wakati wa kupokea bidhaa.',
    'common.viewAll': 'Ona vyote',
    'common.viewDetails': 'Ona maelezo',
    'common.contact': 'Wasiliana',
    'common.available': 'Inapatikana',
    'common.retry': 'Jaribu tena',
    'common.loading': 'Inapakia...',
  },
  lu: {
    'nav.home': 'Kuinzu',
    'nav.marketplace': 'Tshisalu',
    'nav.howItWorks': 'Mushindu udi wenza mudimu',
    'nav.producers': 'Balimi',
    'nav.buyers': 'Basumbi',
    'nav.dashboard': 'Tableau wa mudimu',
    'nav.profile': 'Profile wanyi',
    'nav.login': 'Bwela',
    'nav.register': 'Fuma compte',
    'nav.logout': 'Pataka',
    'nav.account': 'Compte wanyi',
    'lang.switch': 'Muakulu',
    'theme.switch': 'Ibimba',
    'theme.light': 'Butoke',
    'theme.dark': 'Milima',
    'hero.badge': 'AGRITECH RDC',
    'hero.title': 'Kubanga kudi mulimi too ne ku tshisalu.',
    'hero.subtitle': 'AgriFlow udi ufuanyisha balimi, bibuku bya kulima ne basumbi bua kupanda ne kusumba pa bukanguluke — kabuyi ne bantu ba munkatshi.',
    'hero.ctaPrimary': 'Kimba bintu',
    'hero.ctaSecondary': 'Pana bilanga byanyi',
    'hero.statFarmers': 'Balimi',
    'hero.statProducts': 'Bilanga',
    'hero.statBuyers': 'Basumbi',
    'hero.statOrders': 'Bikomanda',
    'search.heading': 'Udi ukeba tshinyi lelu?',
    'search.placeholder': 'Kimba tshintu (mabele, mfumbwa, kakao...)',
    'search.button': 'Kimba',
    'footer.tagline': 'Kubanga kudi mulimi too ne ku tshisalu.',
    'footer.platform': 'Plateforme',
    'footer.account': 'Compte',
    'footer.about': 'Bua tuetu',
    'footer.aboutText': 'AgriFlow RDC — Kutuka ku mudimuki too ku dibaza, ne bukebi.',
    'footer.demoData': 'Difuta ne Mobile Money, ne karte, anyi pa dituku dia kupeta.',
    'common.viewAll': 'Mona byonso',
    'common.viewDetails': 'Mona bimanyisha',
    'common.contact': 'Yukila',
    'common.available': 'Kudi',
    'common.retry': 'Keba kabidi',
    'common.loading': 'Kudi wenda...',
  },
};

function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

/** Traduit une clé ; repli sur le français, puis sur la clé elle-même. `{nom}` est remplacé par `params.nom`. */
export function translate(lang: LanguageCode, key: string, params?: Record<string, string | number>): string {
  return interpolate(TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS.fr[key] ?? key, params);
}

/** Part des clés françaises réellement traduites dans la langue (1 = complète). Sert à signaler « partiel ». */
export function translationCoverage(lang: LanguageCode): number {
  const reference = Object.keys(TRANSLATIONS.fr);
  if (lang === 'fr' || reference.length === 0) return 1;
  const own = TRANSLATIONS[lang];
  return reference.filter((k) => k in own).length / reference.length;
}
