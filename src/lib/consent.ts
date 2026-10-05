import { useSyncExternalStore } from 'react';

/**
 * Gestionnaire de consentement AgriFlow.
 *
 * Ce que fait réellement l'application (vérifié dans le code) :
 *  - AUCUN cookie HTTP n'est posé par AgriFlow (pas de document.cookie) ; l'application utilise le
 *    stockage local du navigateur (localStorage / sessionStorage / Cache du service worker).
 *  - AUCUN outil de mesure d'audience ni de publicité n'est intégré → la catégorie « analytique »
 *    existe dans le modèle (pour l'avenir) mais reste indisponible : ANALYTICS_AVAILABLE = false.
 *  - Seules les PRÉFÉRENCES d'affichage (thème, langue) sont soumises au consentement : sans accord,
 *    elles fonctionnent pendant la visite mais ne sont pas mémorisées.
 *  - Le choix lui-même est conservé dans le navigateur (clé CONSENT_STORAGE_KEY), jamais envoyé au serveur.
 *
 * Pour ajouter un outil analytique plus tard : passer ANALYTICS_AVAILABLE à true, et ne charger
 * l'outil QUE si `getConsent()?.analytics === true`.
 */
export const CONSENT_STORAGE_KEY = 'agriflow_consent';
export const CONSENT_VERSION = 1;
export const ANALYTICS_AVAILABLE = false;

/** Clés de préférences (thème, langue) : soumises au consentement « préférences ». */
export const PREFERENCE_KEYS = ['agriflow_theme', 'agriflow_language'] as const;

export interface ConsentChoices {
  preferences: boolean;
  analytics: boolean;
}

export interface ConsentRecord extends ConsentChoices {
  version: number;
  decidedAt: string;
}

interface ConsentState {
  record: ConsentRecord | null;
  panelOpen: boolean;
}

function isRecord(v: unknown): v is ConsentRecord {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return r.version === CONSENT_VERSION && typeof r.preferences === 'boolean' && typeof r.analytics === 'boolean' && typeof r.decidedAt === 'string';
}

function readRecord(): ConsentRecord | null {
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

let state: ConsentState = { record: typeof window === 'undefined' ? null : readRecord(), panelOpen: false };
const listeners = new Set<() => void>();

function setState(next: Partial<ConsentState>): void {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// Synchronisation entre onglets : un choix fait dans un onglet s'applique aux autres.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === CONSENT_STORAGE_KEY) setState({ record: readRecord() });
  });
}

/** Supprime les préférences déjà mémorisées (retrait du consentement). */
function purgePreferences(): void {
  for (const key of PREFERENCE_KEYS) {
    try { window.localStorage.removeItem(key); } catch { /* stockage indisponible */ }
  }
}

export function getConsent(): ConsentRecord | null {
  return state.record;
}

/** Vrai uniquement si l'utilisateur a explicitement autorisé la mémorisation des préférences. */
export function canStorePreferences(): boolean {
  return state.record?.preferences === true;
}

export function saveConsent(choices: ConsentChoices): void {
  const record: ConsentRecord = {
    version: CONSENT_VERSION,
    decidedAt: new Date().toISOString(),
    preferences: choices.preferences,
    analytics: ANALYTICS_AVAILABLE && choices.analytics,
  };
  try { window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record)); } catch { /* le choix vaut pour la session */ }
  if (!record.preferences) purgePreferences();
  setState({ record, panelOpen: false });
}

export const acceptAll = (): void => saveConsent({ preferences: true, analytics: ANALYTICS_AVAILABLE });
export const rejectNonEssential = (): void => saveConsent({ preferences: false, analytics: false });

export function openConsentPreferences(): void { setState({ panelOpen: true }); }
export function closeConsentPreferences(): void { setState({ panelOpen: false }); }

export function useConsentState(): ConsentState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

/** Booléen stable : la mémorisation des préférences est-elle autorisée ? */
export function usePreferencesAllowed(): boolean {
  return useSyncExternalStore(subscribe, () => state.record?.preferences === true, () => false);
}
