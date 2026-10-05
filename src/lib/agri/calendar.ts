import type { Crop } from './crops';
import { RAINY_MONTHS, REGIME_LABELS, type Zone } from './zones';

/**
 * Calendrier agricole — règles simples et explicites (aucune période « inventée ») :
 *  1. Le régime des pluies de la zone donne les mois pluvieux (voir zones.ts).
 *  2. Chaque culture suit une règle de semis : début des pluies, saison sèche irriguée, ou plantation pérenne.
 *  3. Les récoltes sont estimées à partir de la durée de cycle (ordre de grandeur).
 * Résultat = INDICATIF. Il ne remplace pas un conseil agricole local.
 */
export type MonthStatus = 'favorable' | 'conditional' | 'verify' | 'longcycle' | 'none';

export const MONTH_SHORT = ['JAN', 'FÉV', 'MAR', 'AVR', 'MAI', 'JUN', 'JUL', 'AOÛ', 'SEP', 'OCT', 'NOV', 'DÉC'];
export const MONTH_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export const STATUS_LABELS: Record<MonthStatus, string> = {
  favorable: 'Période favorable',
  conditional: 'Favorable sous conditions',
  verify: 'À vérifier localement',
  longcycle: 'Cycle long',
  none: 'Pas de fenêtre identifiée',
};

export const mod12 = (n: number): number => ((((n - 1) % 12) + 12) % 12) + 1;

export interface MonthCell { month: number; status: MonthStatus; reason: string }

/** Position du mois dans son bloc de pluies : index depuis le début du bloc et longueur du bloc (bloc circulaire). */
function rainyPosition(rainy: number[], month: number): { pos: number; len: number } | null {
  if (!rainy.includes(month)) return null;
  const isRainy = (m: number) => rainy.includes(mod12(m));
  let start = month;
  while (isRainy(start - 1) && mod12(start - 1) !== month) start -= 1;
  let len = 0;
  while (isRainy(start + len) && len < 12) len += 1;
  const pos = ((month - start) % 12 + 12) % 12;
  return { pos, len };
}

export function monthStatus(crop: Crop, zone: Zone, month: number): MonthCell {
  const rainy = RAINY_MONTHS[zone.regime];
  const rp = rainyPosition(rainy, month);

  if (crop.sowing === 'rain_start') {
    if (!rp) return { month, status: 'none', reason: 'Période plutôt sèche : sans irrigation, le semis n\'est pas identifié comme favorable.' };
    if (rp.pos <= 1) return { month, status: 'favorable', reason: 'Début de saison des pluies : période généralement adaptée au semis.' };
    const remaining = rp.len - rp.pos;
    const needed = Math.ceil((crop.cycleDays[0] / 30) * 0.75);
    if (remaining >= needed) return { month, status: 'verify', reason: 'Milieu de saison des pluies : un second semis peut être possible, à vérifier selon les conditions locales.' };
    return { month, status: 'none', reason: 'Fin de saison des pluies : les pluies restantes risquent d\'être trop courtes pour le cycle.' };
  }

  if (crop.sowing === 'perennial') {
    if (rp && rp.pos <= 2) return { month, status: 'longcycle', reason: 'Cycle long : la plantation se fait généralement en début de saison des pluies.' };
    return { month, status: 'none', reason: 'Culture pérenne : hors période de plantation habituelle.' };
  }

  // dry_irrigated (tomate, maraîchage)
  if (!rp) return { month, status: 'conditional', reason: 'Saison plus sèche : favorable sous condition d\'un arrosage maîtrisé (source d\'eau proche).' };
  if (crop.id === 'tomate') return { month, status: 'verify', reason: 'Période pluvieuse : l\'humidité favorise les maladies de la tomate ; à vérifier localement.' };
  return { month, status: 'favorable', reason: 'Période pluvieuse : conditions généralement adaptées aux cultures maraîchères, selon les conditions locales.' };
}

export function cropYear(crop: Crop, zone: Zone): MonthCell[] {
  return Array.from({ length: 12 }, (_, i) => monthStatus(crop, zone, i + 1));
}

export interface CropPhases {
  prep: number[];
  sow: number[];
  care: number[];
  harvest: number[];
  /** Texte de synthèse de la récolte lorsque le cycle dépasse un an. */
  longCycleNote: string | null;
}

const uniqSorted = (a: number[]) => Array.from(new Set(a)).sort((x, y) => x - y);

export function cropPhases(crop: Crop, zone: Zone): CropPhases {
  const year = cropYear(crop, zone);
  const primary = year.filter((c) => c.status === 'favorable' || c.status === 'conditional' || c.status === 'longcycle').map((c) => c.month);
  const sow = primary;
  const prep = uniqSorted(sow.filter((m) => !sow.includes(mod12(m - 1))).map((m) => mod12(m - 1)));
  const minM = Math.ceil(crop.cycleDays[0] / 30);
  const maxM = Math.ceil(crop.cycleDays[1] / 30);

  if (maxM > 12) {
    return {
      prep, sow, care: [], harvest: [],
      longCycleNote: `Récolte après ${crop.cycleLabel.replace(/^environ /, '')}. Aucune récolte n'est placée sur l'année en cours.`,
    };
  }

  const harvest: number[] = [];
  const care: number[] = [];
  for (const m of sow) {
    for (let k = minM; k <= maxM; k += 1) harvest.push(mod12(m + k));
    for (let k = 1; k < minM; k += 1) care.push(mod12(m + k));
  }
  const h = uniqSorted(harvest);
  return { prep, sow: uniqSorted(sow), care: uniqSorted(care).filter((m) => !h.includes(m)), harvest: h, longCycleNote: null };
}

export function monthsToText(months: number[]): string {
  if (months.length === 0) return 'Aucune période identifiée';
  const sorted = uniqSorted(months);
  // regroupe les mois consécutifs (en tenant compte du passage décembre → janvier)
  const isIn = (m: number) => sorted.includes(m);
  const starts = sorted.filter((m) => !isIn(mod12(m - 1)));
  if (starts.length === 0) return 'Toute l\'année';
  return starts.map((s) => {
    let e = s;
    while (isIn(mod12(e + 1)) && mod12(e + 1) !== s) e = mod12(e + 1);
    return s === e ? MONTH_LONG[s - 1] : `${MONTH_LONG[s - 1]} à ${MONTH_LONG[e - 1]}`;
  }).join(' ; ');
}

export function regimeExplanation(zone: Zone): string {
  return REGIME_LABELS[zone.regime];
}

export const CALENDAR_DISCLAIMER =
  'Calendrier indicatif fondé sur des règles simples (régime des pluies de la zone et durée de cycle). Les dates réelles dépendent du lieu, de la variété et de la météo de l\'année : confirmez avec un conseiller agricole local.';
