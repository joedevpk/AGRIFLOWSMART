import { createContext, useContext } from 'react';
import { LANGUAGES, type LanguageCode } from '@/lib/i18n/translations';

export interface LanguageContextValue {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  languages: typeof LANGUAGES;
}

export const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage doit être utilisé à l\'intérieur de <LanguageProvider>');
  return ctx;
}
