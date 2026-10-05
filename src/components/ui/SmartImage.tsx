import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react';
import { Sprout } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildSrcSet } from '@/lib/image-config';

interface SmartImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> {
  src: string;
  /** Obligatoire : texte alternatif descriptif. */
  alt: string;
  /** Image de secours si `src` ne charge pas. */
  fallbackSrc?: string;
  /** Image au-dessus de la ligne de flottaison : chargement immédiat au lieu de lazy. */
  priority?: boolean;
  /** Classes du conteneur (doit être dimensionné par le parent). */
  wrapperClassName?: string;
}

/**
 * Image avec chargement différé, squelette pendant le chargement,
 * srcset responsive (sources Pexels) et image de secours en cas d'erreur.
 */
export function SmartImage({ src, alt, fallbackSrc, priority, wrapperClassName, className, sizes, ...rest }: SmartImageProps) {
  const [current, setCurrent] = useState(src);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setCurrent(src);
    setLoaded(false);
    setFailed(false);
  }, [src]);

  // L'image peut déjà être en cache avant l'attache du handler onLoad.
  useEffect(() => {
    const el = ref.current;
    if (el && el.complete && el.naturalWidth > 0) setLoaded(true);
  }, [current]);

  const handleError = () => {
    if (fallbackSrc && current !== fallbackSrc) {
      setCurrent(fallbackSrc);
      setLoaded(false);
    } else {
      setFailed(true);
    }
  };

  return (
    <div className={cn('relative h-full w-full overflow-hidden bg-sage/60', wrapperClassName)}>
      {failed ? (
        <div role="img" aria-label={alt} className="flex h-full w-full items-center justify-center text-brand-600/40">
          <Sprout className="h-10 w-10" />
        </div>
      ) : (
        <>
          {!loaded && <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-sage/80 to-cream" aria-hidden="true" />}
          <img
            ref={ref}
            src={current}
            srcSet={buildSrcSet(current)}
            sizes={sizes ?? '(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw'}
            alt={alt}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            onLoad={() => setLoaded(true)}
            onError={handleError}
            className={cn('h-full w-full object-cover transition-opacity duration-500', loaded ? 'opacity-100' : 'opacity-0', className)}
            {...rest}
          />
        </>
      )}
    </div>
  );
}
