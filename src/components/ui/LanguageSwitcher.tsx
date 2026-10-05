import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Globe, Check } from 'lucide-react';
import { useLanguage } from '@/contexts/language-context';
import { translationCoverage } from '@/lib/i18n/translations';
import { cn } from '@/lib/utils';

interface LanguageSwitcherProps {
  className?: string;
  /** Bouton pour fond sombre (en-tête vert / tiroir). */
  onDark?: boolean;
  /** Icône seule (menu desktop). Le libellé reste exposé aux lecteurs d'écran. */
  iconOnly?: boolean;
}

/**
 * Sélecteur de langue.
 * Correctif Passe 23 : l'en-tête masquait le libellé avec `[&_span]:hidden`, ce qui masquait AUSSI les
 * <span> du menu déroulant (noms de langues invisibles). Le libellé est désormais piloté par la prop
 * `iconOnly`, jamais par un sélecteur CSS global sur les <span>.
 * Gère : fermeture au clic extérieur (pointerdown) et à Échap, navigation clavier (↑ ↓ Home End),
 * retour du focus sur le bouton, état sélectionné + coche, langues partielles signalées.
 */
export function LanguageSwitcher({ className, onDark, iconOnly }: LanguageSwitcherProps) {
  const { language, setLanguage, languages, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const listId = useId();
  const current = languages.find((l) => l.code === language);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Place le focus sur la langue active à l'ouverture.
  useEffect(() => {
    if (!open) return;
    const index = Math.max(0, languages.findIndex((l) => l.code === language));
    optionRefs.current[index]?.focus();
  }, [open, languages, language]);

  const onListKeyDown = (e: React.KeyboardEvent) => {
    const items = optionRefs.current.filter((el): el is HTMLButtonElement => el !== null);
    const index = items.findIndex((el) => el === document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(index + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(index - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1]?.focus(); }
    else if (e.key === 'Tab') setOpen(false);
  };

  const label = t('lang.switch');

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); close(true); } else if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); } }}
        aria-label={`${label} — ${current?.nativeLabel ?? 'Français'}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        className={cn(
          'flex min-h-[44px] items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border text-xs font-semibold transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-1',
          onDark
            ? 'border-white/25 bg-white/10 px-3 text-white hover:bg-white/20'
            : 'border-black/[0.06] dark:border-white/10 bg-offwhite dark:bg-charcoal/60 px-2.5 text-charcoal/70 dark:text-cream/80 hover:border-brand-300 hover:text-brand-700 dark:hover:text-brand-300',
        )}
      >
        <Globe className="h-4 w-4" aria-hidden="true" />
        <span className={cn(iconOnly && 'sr-only')}>{current?.nativeLabel ?? 'Français'}</span>
      </button>
      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label={label}
          onKeyDown={onListKeyDown}
          className="absolute right-0 top-full z-50 mt-2 w-56 max-w-[calc(100vw-1rem)] rounded-xl border border-black/10 bg-white p-1.5 text-charcoal shadow-lg animate-scale-in dark:border-white/15 dark:bg-charcoal dark:text-cream"
        >
          {languages.map((lang, i) => {
            const selected = lang.code === language;
            const partial = translationCoverage(lang.code) < 1;
            return (
              <button
                key={lang.code}
                ref={(el) => { optionRefs.current[i] = el; }}
                type="button"
                role="option"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => { setLanguage(lang.code); close(true); }}
                className={cn(
                  'flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                  selected
                    ? 'bg-brand-50 font-semibold text-brand-800 dark:bg-brand-900/50 dark:text-brand-100'
                    : 'text-charcoal hover:bg-cream dark:text-cream dark:hover:bg-white/10',
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate">{lang.nativeLabel}</span>
                  {partial && (
                    <span className="block text-[11px] font-normal text-charcoal/60 dark:text-cream/60" title={t('lang.partialHint')}>
                      {t('lang.partial')}
                    </span>
                  )}
                </span>
                {selected && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
