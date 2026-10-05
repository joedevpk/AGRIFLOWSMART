import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { LANGUAGES, TRANSLATIONS, translate, type LanguageCode } from '@/lib/i18n/translations';
import { LanguageContext, type LanguageContextValue } from './language-context';
import { canStorePreferences, usePreferencesAllowed } from '@/lib/consent';

const STORAGE_KEY = 'agriflow_language';

function getInitialLanguage(): LanguageCode {
  if (typeof window === 'undefined') return 'fr';
  // La langue mémorisée n'est relue que si l'utilisateur a autorisé les cookies de préférences.
  const stored = canStorePreferences() ? (window.localStorage.getItem(STORAGE_KEY) as LanguageCode | null) : null;
  if (stored && stored in TRANSLATIONS) return stored;
  return 'fr';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(getInitialLanguage);
  const preferencesAllowed = usePreferencesAllowed();

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  // Mémorisation soumise au consentement « préférences » ; retirée si le consentement est retiré.
  useEffect(() => {
    try {
      if (preferencesAllowed) window.localStorage.setItem(STORAGE_KEY, language);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // stockage indisponible (mode privé) : on ignore silencieusement
    }
  }, [language, preferencesAllowed]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage: setLanguageState,
      t: (key: string, params?: Record<string, string | number>) => translate(language, key, params),
      languages: LANGUAGES,
    }),
    [language],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
