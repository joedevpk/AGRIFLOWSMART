/**
 * Métadonnées communes des documents de confiance.
 * À mettre à jour à CHAQUE modification de fond d'un texte (et à valider juridiquement avant production).
 */
export const LEGAL_UPDATED_ISO = '2026-09-28';
export const LEGAL_UPDATED_LABEL = '28 septembre 2026';

export interface LegalLink { label: string; to: string }

/** Pages du centre de confiance (navigation croisée en bas de chaque document). */
export const LEGAL_PAGES: LegalLink[] = [
  { label: 'Politique de confidentialité', to: '/confidentialite' },
  { label: 'Conditions d\'utilisation', to: '/conditions' },
  { label: 'Politique de cookies', to: '/cookies' },
  { label: 'Politique de remboursement', to: '/remboursement' },
  { label: 'Centre de confiance', to: '/confiance' },
];
