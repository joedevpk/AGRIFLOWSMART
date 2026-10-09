import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { Heart } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useFavorites } from '@/hooks/useFavorites';
import { favoriteLabel } from '@/lib/favorites';
import { cn } from '@/lib/utils';

interface FavoriteButtonProps {
  productId: string;
  productName?: string;
  /** `overlay` : pastille translucide sur une photo (cartes) ; `inline` : bouton contour (fiche produit). */
  variant?: 'overlay' | 'inline';
  className?: string;
}

// 6 petits cœurs qui s'écartent du bouton (distance fixe, aucune mesure du DOM).
const PARTICLES = [0, 60, 120, 180, 240, 300].map((deg) => {
  const rad = (deg * Math.PI) / 180;
  return { '--fav-dx': `${Math.round(Math.cos(rad) * 22)}px`, '--fav-dy': `${Math.round(Math.sin(rad) * 22)}px` } as CSSProperties;
});

const BURST_MS = 700;

/**
 * Cœur de favoris unique pour toute l'application (état partagé via FavoritesProvider).
 * Zone tactile 44 px minimum, nom accessible dynamique, animation courte (CSS, désactivée si
 * prefers-reduced-motion). Ne propage jamais le clic : sûr dans une carte cliquable.
 */
export function FavoriteButton({ productId, productName, variant = 'overlay', className }: FavoriteButtonProps) {
  const { has, busy, toggle } = useFavorites();
  const { user } = useAuth();
  const active = has(productId);
  const isBusy = busy.has(productId);
  const [burst, setBurst] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (isBusy) return;
    // Animation uniquement pour un ajout réel (utilisateur connecté) : jamais de faux succès pour un visiteur.
    if (user && !active) {
      setBurst((n) => n + 1);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setBurst(0), BURST_MS);
    }
    void toggle(productId);
  };

  const icon = (
    <span key={`icon-${burst}`} className={cn('relative flex', burst > 0 && 'fav-pop')}>
      <Heart
        className={cn(
          'h-5 w-5 transition-[fill,color] duration-200',
          active ? 'fill-rose-500 text-rose-500' : 'fill-transparent text-slate-600 dark:text-slate-200',
        )}
        aria-hidden="true"
      />
    </span>
  );

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={favoriteLabel(active, productName)}
      aria-busy={isBusy || undefined}
      className={cn(
        'relative flex shrink-0 touch-manipulation items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
        isBusy && 'cursor-progress',
        variant === 'overlay'
          ? 'h-11 w-11 rounded-full'
          : 'h-12 w-12 rounded-xl border border-brand-200 bg-white transition-colors hover:bg-cream dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10',
        className,
      )}
    >
      {variant === 'overlay' ? (
        <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/85 shadow-sm backdrop-blur-sm transition-colors hover:bg-white dark:bg-night-900/75 dark:hover:bg-night-900">
          {icon}
        </span>
      ) : (
        icon
      )}
      {burst > 0 && (
        <span key={`fx-${burst}`} aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="fav-ring absolute h-9 w-9 rounded-full border-2 border-rose-400" />
          {PARTICLES.map((style, i) => (
            <Heart key={i} style={style} className="fav-particle absolute h-2.5 w-2.5 fill-rose-400 text-rose-400" />
          ))}
        </span>
      )}
    </button>
  );
}
