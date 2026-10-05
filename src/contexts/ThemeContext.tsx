import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ThemeContext, type Theme, type ThemeContextValue } from './theme-context';
import { canStorePreferences, usePreferencesAllowed } from '@/lib/consent';

const STORAGE_KEY = 'agriflow_theme';

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  // Le thème mémorisé n'est relu que si l'utilisateur a autorisé les cookies de préférences.
  const stored = canStorePreferences() ? (window.localStorage.getItem(STORAGE_KEY) as Theme | null) : null;
  if (stored === 'light' || stored === 'dark') return stored;
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);
  const preferencesAllowed = usePreferencesAllowed();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // Mémorisation soumise au consentement « préférences » ; retirée si le consentement est retiré.
  useEffect(() => {
    try {
      if (preferencesAllowed) window.localStorage.setItem(STORAGE_KEY, theme);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // stockage indisponible (mode privé) : on ignore silencieusement
    }
  }, [theme, preferencesAllowed]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme: setThemeState,
      toggleTheme: () => setThemeState((prev) => (prev === 'light' ? 'dark' : 'light')),
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
