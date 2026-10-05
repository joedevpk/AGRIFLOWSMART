import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/contexts/theme-context';
import { useLanguage } from '@/contexts/language-context';
import { cn } from '@/lib/utils';

export function ThemeToggle({ className, onDark }: { className?: string; onDark?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const { t } = useLanguage();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={t('theme.switch')}
      title={isDark ? t('theme.light') : t('theme.dark')}
      className={cn(
        'flex items-center justify-center rounded-xl border transition-colors',
        onDark
          ? 'h-11 w-11 border-white/25 bg-white/10 text-white hover:bg-white/20'
          : 'h-8 w-8 border-black/[0.06] dark:border-white/10 bg-offwhite dark:bg-charcoal/60 text-charcoal/70 dark:text-cream/80 hover:border-brand-300 hover:text-brand-700 dark:hover:text-brand-300',
        className,
      )}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
