import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ENV_STATUS } from '@/lib/env';
import { ConfigErrorPage } from '@/components/system/ConfigErrorPage';
import { ErrorBoundary } from '@/components/system/ErrorBoundary';
import { log, reportError } from '@/lib/logger';

if (!ENV_STATUS.ok) {
  // Uniquement les NOMS des variables (jamais les valeurs) ; rien n'est affiché à l'utilisateur.
  log('error', 'env', 'Configuration publique incomplète', { missing: ENV_STATUS.missing, invalid: ENV_STATUS.invalid, forbidden: ENV_STATUS.forbidden });
}

// Erreurs hors rendu React (promesses rejetées, erreurs asynchrones) : journalisées, jamais affichées.
window.addEventListener('unhandledrejection', (e) => reportError('window.unhandledrejection', e.reason));
window.addEventListener('error', (e) => reportError('window.error', e.error ?? e.message));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {ENV_STATUS.ok ? <ErrorBoundary><App /></ErrorBoundary> : <ConfigErrorPage />}
  </StrictMode>
);

// Mode faible connexion : service worker (production uniquement, pour ne pas gêner le développement).
if (ENV_STATUS.ok && import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* le site fonctionne normalement sans service worker */ });
  });
}
