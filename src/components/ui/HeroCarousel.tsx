import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ImageEntry } from '@/lib/image-config';
import { buildSrcSet } from '@/lib/image-config';
import { cn } from '@/lib/utils';

interface HeroCarouselProps {
  images: ImageEntry[];
  intervalMs?: number;
  className?: string;
  /**
   * `panel` : rendu d'origine (photo encadrée). `background` : photo plein écran derrière
   * un titre — flèches et points regroupés en bas à droite pour ne pas croiser le texte,
   * léger zoom lent sur la photo active. Le fonctionnement (rotation, swipe, pause) est identique.
   */
  variant?: 'panel' | 'background';
}

/**
 * Carrousel hero : rotation automatique, swipe mobile, flèches desktop, points de
 * navigation, pause au survol, respect de prefers-reduced-motion. Toutes les images
 * sont montées dès le départ (une seule requête réseau chacune) : le changement de
 * slide n'est qu'un fondu d'opacité, jamais un nouveau chargement réseau.
 */
export function HeroCarousel({ images, intervalMs = 4000, className, variant = 'panel' }: HeroCarouselProps) {
  const isBackground = variant === 'background';
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const reducedMotion = useRef(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

  const goTo = useCallback((i: number) => setIndex((i + images.length) % images.length), [images.length]);
  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  const prev = useCallback(() => goTo(index - 1), [goTo, index]);

  useEffect(() => {
    if (paused || reducedMotion.current || images.length <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % images.length), intervalMs);
    return () => clearInterval(id);
  }, [paused, intervalMs, images.length]);

  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) > 40) (delta < 0 ? next : prev)();
    touchStartX.current = null;
  };

  if (images.length === 0) return null;

  return (
    <div
      className={cn('group/hero relative h-full w-full overflow-hidden', className)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      role="group"
      aria-roledescription="carrousel"
      aria-label="Photographies agricoles"
    >
      {images.map((img, i) => (
        <img
          key={img.url}
          src={img.url}
          srcSet={buildSrcSet(img.url, [640, 1024, 1600])}
          sizes={isBackground ? '100vw' : '(min-width: 1024px) 55vw, 100vw'}
          alt={i === index ? img.alt : ''}
          aria-hidden={i !== index}
          loading={i === 0 ? 'eager' : 'lazy'}
          fetchPriority={i === 0 ? 'high' : 'auto'}
          className={cn(
            'absolute inset-0 h-full w-full object-cover object-center',
            isBackground
              ? '[transition:opacity_1000ms_ease-in-out,transform_8000ms_ease-out]'
              : 'transition-opacity duration-[900ms] ease-in-out',
            i === index ? 'opacity-100' : 'opacity-0',
            isBackground && (i === index ? 'scale-100' : 'scale-[1.05]'),
          )}
        />
      ))}
      {!isBackground && <div className="absolute inset-0 bg-gradient-to-t from-charcoal/30 via-transparent to-transparent" />}

      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            aria-label="Photo précédente"
            className={cn(
              'hidden items-center justify-center rounded-full bg-offwhite/80 p-2 text-charcoal shadow-card transition-opacity hover:bg-offwhite md:flex',
              isBackground
                ? 'absolute bottom-6 right-[4.5rem] z-20 lg:right-24'
                : 'absolute left-3 top-1/2 -translate-y-1/2 opacity-0 group-hover/hero:opacity-100',
            )}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Photo suivante"
            className={cn(
              'hidden items-center justify-center rounded-full bg-offwhite/80 p-2 text-charcoal shadow-card transition-opacity hover:bg-offwhite md:flex',
              isBackground
                ? 'absolute bottom-6 right-6 z-20 lg:right-10'
                : 'absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover/hero:opacity-100',
            )}
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <div
            className={cn(
              'absolute flex gap-1.5',
              isBackground ? 'bottom-6 left-4 z-20 h-9 items-center sm:left-6 md:left-auto md:right-40 lg:right-[10.5rem]' : 'bottom-4 left-1/2 -translate-x-1/2',
            )}
            role="tablist"
          >
            {images.map((img, i) => (
              <button
                key={img.url}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Aller à la photo ${i + 1}`}
                onClick={() => goTo(i)}
                className={cn(
                  'relative h-1.5 rounded-full transition-all before:absolute before:-inset-x-1 before:-inset-y-3 before:content-[""]',
                  i === index ? 'w-6 bg-offwhite' : 'w-1.5 bg-offwhite/50 hover:bg-offwhite/75',
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
