/**
 * Présentation du créateur du projet — SEUL endroit à modifier pour changer le nom, la fonction, le texte ou ajouter des liens.
 * Le texte ne contient que des informations fournies par le créateur ; aucune biographie, formation, distinction ou statistique
 * n'est inventée. Pour enrichir la page plus tard : compléter `bio` et `links` (réseaux professionnels, e-mail…).
 */
export interface FounderLink { label: string; href: string }

export const FOUNDER = {
  name: 'Joël Piako', // orthographe à confirmer : voir docs/REFONTE-IDENTITE.md
  role: 'Créateur et développeur d\'AgriFlow RDC',
  photo: {
    webp: '/images/createur/createur-agriflow.webp',
    jpg: '/images/createur/createur-agriflow.jpg',
    width: 440,
    height: 550,
    alt: 'Portrait de Joël Piako, créateur et développeur d\'AgriFlow RDC',
  },
  bio: [
    'AgriFlow RDC est née d\'une idée simple : faciliter les échanges entre les producteurs, les acheteurs et les autres acteurs du secteur agricole en République démocratique du Congo.',
    'Joël Piako conçoit et développe la plateforme, de l\'expérience sur téléphone et ordinateur jusqu\'au suivi des commandes.',
  ],
  /** Liens professionnels à ajouter ultérieurement (aucun n'est affiché tant que la liste est vide). */
  links: [] as FounderLink[],
} as const;
