/**
 * Zones de référence AgriFlow (villes/pôles agricoles de la RDC).
 *
 * IMPORTANT — nature de ces données : ce sont des ORDRES DE GRANDEUR climatiques
 * (moyennes annuelles approximatives, altitude de la ville de référence), pas des mesures
 * en temps réel. Aucune API météo ni satellite n'est connectée. Ces valeurs doivent être
 * présentées comme « référence indicative de zone » et confirmées par un conseiller agricole.
 */
export type Regime = 'south' | 'south_plateau' | 'north' | 'equatorial' | 'kivu';

export interface Zone {
  id: string;
  name: string;
  region: string;
  regime: Regime;
  /** Température moyenne annuelle approximative (°C). */
  tempC: number;
  /** Pluviométrie annuelle approximative (mm). */
  rainMm: number;
  /** Altitude approximative de la ville de référence (m). */
  altM: number;
}

export const ZONES: Zone[] = [
  { id: 'kinshasa', name: 'Kinshasa', region: 'Kinshasa', regime: 'south', tempC: 25.5, rainMm: 1400, altM: 310 },
  { id: 'matadi', name: 'Matadi', region: 'Kongo Central', regime: 'south', tempC: 26, rainMm: 1100, altM: 100 },
  { id: 'kikwit', name: 'Kikwit', region: 'Kwilu', regime: 'south', tempC: 25, rainMm: 1500, altM: 480 },
  { id: 'kananga', name: 'Kananga', region: 'Kasaï-Central', regime: 'south', tempC: 24.5, rainMm: 1500, altM: 650 },
  { id: 'mbuji-mayi', name: 'Mbuji-Mayi', region: 'Kasaï-Oriental', regime: 'south', tempC: 24.5, rainMm: 1400, altM: 650 },
  { id: 'lubumbashi', name: 'Lubumbashi', region: 'Haut-Katanga', regime: 'south_plateau', tempC: 20.5, rainMm: 1250, altM: 1250 },
  { id: 'kalemie', name: 'Kalemie', region: 'Tanganyika', regime: 'south_plateau', tempC: 25, rainMm: 1000, altM: 780 },
  { id: 'kindu', name: 'Kindu', region: 'Maniema', regime: 'equatorial', tempC: 25, rainMm: 1700, altM: 480 },
  { id: 'kisangani', name: 'Kisangani', region: 'Tshopo', regime: 'equatorial', tempC: 25, rainMm: 1700, altM: 420 },
  { id: 'mbandaka', name: 'Mbandaka', region: 'Équateur', regime: 'equatorial', tempC: 25.5, rainMm: 1750, altM: 320 },
  { id: 'bunia', name: 'Bunia', region: 'Ituri', regime: 'north', tempC: 21.5, rainMm: 1300, altM: 1300 },
  { id: 'isiro', name: 'Isiro', region: 'Haut-Uele', regime: 'north', tempC: 24, rainMm: 1600, altM: 750 },
  { id: 'goma', name: 'Goma', region: 'Nord-Kivu', regime: 'kivu', tempC: 20, rainMm: 1300, altM: 1500 },
  { id: 'beni', name: 'Beni', region: 'Nord-Kivu', regime: 'kivu', tempC: 22, rainMm: 1600, altM: 1100 },
  { id: 'butembo', name: 'Butembo', region: 'Nord-Kivu', regime: 'kivu', tempC: 18, rainMm: 1500, altM: 1800 },
  { id: 'bukavu', name: 'Bukavu', region: 'Sud-Kivu', regime: 'kivu', tempC: 19.5, rainMm: 1350, altM: 1500 },
];

export const ZONES_SOURCE =
  'Référence indicative de zone (moyennes climatiques approximatives, ordre de grandeur). Aucune donnée météo ou satellite en temps réel n\'est connectée.';

/** Mois (1–12) globalement pluvieux selon le régime pluviométrique. Règle simplifiée, à confirmer localement. */
export const RAINY_MONTHS: Record<Regime, number[]> = {
  south: [10, 11, 12, 1, 2, 3, 4],
  south_plateau: [11, 12, 1, 2, 3, 4],
  north: [4, 5, 6, 7, 8, 9, 10],
  equatorial: [3, 4, 5, 9, 10, 11],
  kivu: [9, 10, 11, 12, 2, 3, 4, 5],
};

export const REGIME_LABELS: Record<Regime, string> = {
  south: 'Saison des pluies d\'octobre à avril environ, saison sèche de mai à septembre',
  south_plateau: 'Saison des pluies de novembre à avril environ, saison sèche de mai à octobre',
  north: 'Saison des pluies d\'avril à octobre environ, saison sèche de novembre à mars',
  equatorial: 'Deux saisons des pluies (mars–mai et septembre–novembre), deux périodes plus sèches',
  kivu: 'Deux saisons des pluies (septembre–décembre et février–mai), saison sèche de juin à août',
};

export function getZone(id: string | null | undefined): Zone | undefined {
  return ZONES.find((z) => z.id === id);
}

/** Retrouve une zone à partir d'un texte libre (ex. « Kinshasa », « Goma »). */
export function findZoneByName(text: string | null | undefined): Zone | undefined {
  if (!text) return undefined;
  const t = text.trim().toLowerCase();
  return ZONES.find((z) => z.name.toLowerCase() === t || z.id === t || z.region.toLowerCase() === t);
}
