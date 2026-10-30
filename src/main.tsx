import { registerServiceWorker } from '@/lib/native/serviceWorker';
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

// Mode faible connexion (Web, production). Dans l'application native le Service Worker n'est pas enregistré (voir lib/native/serviceWorker).
if (ENV_STATUS.ok) registerServiceWorker();
