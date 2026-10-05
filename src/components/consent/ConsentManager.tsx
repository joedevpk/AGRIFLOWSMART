import { useConsentState } from '@/lib/consent';
import { CookieBanner } from './CookieBanner';
import { CookiePreferencesModal } from './CookiePreferencesModal';

/** Monté une seule fois dans l'application : bannière de première visite + panneau de préférences. */
export function ConsentManager() {
  const { record, panelOpen } = useConsentState();
  return (
    <>
      {!record && !panelOpen && <CookieBanner />}
      {panelOpen && <CookiePreferencesModal />}
    </>
  );
}
