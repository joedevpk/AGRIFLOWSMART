import type { Crop, Range, SoilType } from './crops';
import { SOIL_LABELS } from './crops';
import type { Zone } from './zones';

/**
 * Indice d'aptitude agricole (0–100) — AIDE À LA DÉCISION, jamais une probabilité de réussite.
 * Seuls les facteurs réellement disponibles entrent dans le calcul ; le nombre de facteurs
 * pris en compte et leur origine sont toujours affichés.
 */
export type WaterAccess = 'irrigation' | 'cours_eau' | 'pluie' | 'inconnu';
export type DataKind = 'climatique' | 'pedologique' | 'agriculteur' | 'satellite';
export type FactorStatus = 'favorable' | 'compatible' | 'limited' | 'partial' | 'verify' | 'unavailable';

export const WATER_LABELS: Record<WaterAccess, string> = {
  irrigation: 'Irrigation disponible',
  cours_eau: 'Cours d\'eau / puits à proximité',
  pluie: 'Pluie uniquement',
  inconnu: 'Je ne sais pas',
};

export interface PlotInputs {
  zone?: Zone | null;
  soilType?: SoilType | null;
  soilPh?: number | null;
  water?: WaterAccess | null;
}

export interface Factor {
  key: 'temperature' | 'rainfall' | 'altitude' | 'soil' | 'water';
  label: string;
  status: FactorStatus;
  statusLabel: string;
  /** null = non pris en compte dans l'indice. */
  score: number | null;
  weight: number;
  detail: string;
  dataKind: DataKind;
}

export interface Suitability {
  score: number | null;
  rating: string | null;
  usedFactors: number;
  totalFactors: number;
  confidence: 'low' | 'medium' | 'high';
  factors: Factor[];
  explanation: string;
  disclaimer: string;
}

export const SUITABILITY_DISCLAIMER =
  'Indice d\'aptitude agricole : aide à la décision fondée sur les données disponibles. Ce n\'est ni une probabilité de réussite ni une garantie de résultat ; il ne remplace pas l\'avis d\'un conseiller agricole.';

const STATUS_LABELS: Record<FactorStatus, string> = {
  favorable: 'Favorable',
  compatible: 'Compatible',
  limited: 'Limité',
  partial: 'Données partielles',
  verify: 'À vérifier',
  unavailable: 'Donnée non disponible',
};

/** Score 0–1 d'une valeur par rapport à une plage optimale / absolue. */
export function rangeScore(v: number, r: Range): number {
  if (v >= r.optMin && v <= r.optMax) return 1;
  if (v < r.optMin) {
    if (v < r.absMin) return 0.15;
    const span = r.optMin - r.absMin || 1;
    return 0.5 + 0.45 * ((v - r.absMin) / span);
  }
  if (v > r.absMax) return 0.15;
  const span = r.absMax - r.optMax || 1;
  return 0.5 + 0.45 * ((r.absMax - v) / span);
}

function statusFromScore(s: number): FactorStatus {
  if (s >= 0.85) return 'favorable';
  if (s >= 0.5) return 'compatible';
  return 'limited';
}

function factor(base: Omit<Factor, 'statusLabel'>): Factor {
  return { ...base, statusLabel: STATUS_LABELS[base.status] };
}

export function ratingFor(score: number): string {
  if (score >= 75) return 'Bonne aptitude';
  if (score >= 50) return 'Aptitude moyenne';
  return 'Aptitude limitée';
}

export function computeSuitability(crop: Crop, inputs: PlotInputs): Suitability {
  const { zone } = inputs;
  const factors: Factor[] = [];

  // Température / pluie / altitude : référence de zone (données climatiques indicatives)
  const zoneFactor = (
    key: 'temperature' | 'rainfall' | 'altitude', label: string, weight: number,
    value: number | undefined, range: Range, unit: string, fmt: (v: number) => string,
  ): Factor => {
    if (value === undefined) {
      return factor({ key, label, status: 'unavailable', score: null, weight, dataKind: 'climatique', detail: 'Choisissez une zone pour disposer de cette donnée.' });
    }
    const s = rangeScore(value, range);
    return factor({
      key, label, status: statusFromScore(s), score: s, weight, dataKind: 'climatique',
      detail: `Zone : ${fmt(value)} ${unit} (référence indicative). Plage favorable pour ${crop.name.toLowerCase()} : ${fmt(range.optMin)}–${fmt(range.optMax)} ${unit}.`,
    });
  };
  const n0 = (v: number) => String(Math.round(v));
  factors.push(zoneFactor('temperature', 'Température', 0.25, zone?.tempC, crop.temp, '°C', (v) => String(Math.round(v * 10) / 10)));
  factors.push(zoneFactor('rainfall', 'Pluviométrie', 0.25, zone?.rainMm, crop.rain, 'mm/an', n0));
  factors.push(zoneFactor('altitude', 'Altitude', 0.15, zone?.altM, crop.alt, 'm', n0));

  // Sol : données fournies par l'agriculteur (type de sol, pH) — jamais déduites d'une image
  const parts: number[] = [];
  const soilNotes: string[] = [];
  if (inputs.soilType) {
    const s = crop.soilPrefer.includes(inputs.soilType) ? 1 : crop.soilTolerate.includes(inputs.soilType) ? 0.65 : 0.3;
    parts.push(s);
    soilNotes.push(`Sol ${SOIL_LABELS[inputs.soilType].toLowerCase()} (${s === 1 ? 'bien adapté' : s > 0.5 ? 'toléré' : 'peu adapté'})`);
  }
  if (typeof inputs.soilPh === 'number' && !Number.isNaN(inputs.soilPh)) {
    const s = rangeScore(inputs.soilPh, crop.ph);
    parts.push(s);
    soilNotes.push(`pH ${inputs.soilPh} (plage favorable ${crop.ph.optMin}–${crop.ph.optMax})`);
  }
  if (parts.length === 0) {
    factors.push(factor({ key: 'soil', label: 'Sol', status: 'unavailable', score: null, weight: 0.2, dataKind: 'agriculteur', detail: 'Type de sol et pH non renseignés. Aucune analyse de sol n\'est déduite automatiquement : renseignez ce que vous savez, ou faites une analyse.' }));
  } else {
    const avg = parts.reduce((a, b) => a + b, 0) / parts.length;
    const partial = parts.length < 2;
    factors.push(factor({
      key: 'soil', label: 'Sol', status: partial ? 'partial' : statusFromScore(avg), score: avg,
      weight: partial ? 0.1 : 0.2, dataKind: 'agriculteur',
      detail: `${soilNotes.join(' · ')}. Données fournies par l'agriculteur${partial ? ' (incomplètes)' : ''}.`,
    }));
  }

  // Eau : information de l'agriculteur
  const water = inputs.water ?? 'inconnu';
  if (water === 'inconnu') {
    factors.push(factor({ key: 'water', label: 'Eau disponible', status: 'verify', score: null, weight: 0.15, dataKind: 'agriculteur', detail: 'Disponibilité en eau non précisée : à vérifier avant de vous engager.' }));
  } else {
    const s = water === 'irrigation' ? 1 : water === 'cours_eau' ? 0.9 : crop.waterSensitive ? 0.6 : 0.85;
    factors.push(factor({
      key: 'water', label: 'Eau disponible', status: statusFromScore(s), score: s, weight: 0.15, dataKind: 'agriculteur',
      detail: `${WATER_LABELS[water]}${water === 'pluie' && crop.waterSensitive ? ' : cette culture est sensible aux manques d\'eau, un point d\'eau serait un atout.' : '.'}`,
    }));
  }

  const used = factors.filter((f) => f.score !== null);
  const totalW = used.reduce((a, f) => a + f.weight, 0);
  const canScore = Boolean(zone) && used.length >= 3;
  const score = canScore ? Math.round((100 * used.reduce((a, f) => a + (f.score as number) * f.weight, 0)) / totalW) : null;

  const soilKnown = factors.find((f) => f.key === 'soil')!.score !== null;
  const waterKnown = factors.find((f) => f.key === 'water')!.score !== null;
  const confidence: Suitability['confidence'] = soilKnown && waterKnown ? 'high' : soilKnown || waterKnown ? 'medium' : 'low';

  return {
    score, rating: score === null ? null : ratingFor(score),
    usedFactors: used.length, totalFactors: factors.length, confidence, factors,
    explanation: buildExplanation(crop, zone ?? null, score, factors, confidence),
    disclaimer: SUITABILITY_DISCLAIMER,
  };
}

function buildExplanation(crop: Crop, zone: Zone | null, score: number | null, factors: Factor[], confidence: Suitability['confidence']): string {
  if (!zone) return `Choisissez une zone pour estimer l'aptitude de la culture « ${crop.name} » : sans localisation, la température, la pluviométrie et l'altitude ne sont pas disponibles.`;
  if (score === null) return `Les données disponibles sont insuffisantes pour calculer un indice pour « ${crop.name} » à ${zone.name}.`;
  const good = factors.filter((f) => f.status === 'favorable').map((f) => f.label.toLowerCase());
  const ok = factors.filter((f) => f.status === 'compatible').map((f) => f.label.toLowerCase());
  const bad = factors.filter((f) => f.status === 'limited').map((f) => f.label.toLowerCase());
  const todo = factors.filter((f) => f.status === 'verify' || f.status === 'unavailable' || f.status === 'partial').map((f) => f.label.toLowerCase());
  const parts: string[] = [`Pour « ${crop.name} » à ${zone.name}, l'aptitude est ${score >= 75 ? 'bonne' : score >= 50 ? 'moyenne' : 'limitée'} selon les données disponibles.`];
  if (good.length) parts.push(`Points favorables : ${good.join(', ')}.`);
  if (ok.length) parts.push(`Compatible mais moins optimal : ${ok.join(', ')}.`);
  if (bad.length) parts.push(`Points limitants : ${bad.join(', ')}.`);
  if (todo.length) parts.push(`À vérifier ou à compléter : ${todo.join(', ')}.`);
  if (confidence === 'low') parts.push('L\'indice repose surtout sur la référence climatique de la zone : renseignez le sol et l\'eau pour l\'affiner.');
  return parts.join(' ');
}
