import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SmartImage } from '@/components/ui/SmartImage';

interface ProductGalleryProps {
  images: string[];
  alt: string;
  fallbackSrc?: string;
  className?: string;
}

/** Galerie : grande image 4:3, flèches, balayage tactile et vignettes. */
export function ProductGallery({ images, alt, fallbackSrc, className }: ProductGalleryProps) {
  const [active, setActive] = useState(0);
  const [touchX, setTouchX] = useState<number | null>(null);
  const list = images;
  const count = list.length;
  if (count === 0) return null;

  const go = (delta: number) => setActive((a) => (a + delta + count) % count);

  return (
    <div className={cn('space-y-3', className)}>
      <div
        className="group relative aspect-[4/3] overflow-hidden rounded-3xl bg-sage/50 ring-1 ring-black/[0.04]"
        onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX === null) return;
          const dx = e.changedTouches[0].clientX - touchX;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
          setTouchX(null);
        }}
      >
        <SmartImage
          key={list[active]}
          src={list[active]}
          fallbackSrc={fallbackSrc}
          alt={count > 1 ? `${alt} — photo ${active + 1} sur ${count}` : alt}
          priority={active === 0}
          sizes="(min-width: 1024px) 50vw, 100vw"
        />
        {count > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="Photo précédente" className="absolute left-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-offwhite/90 text-charcoal shadow-md hover:bg-white">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => go(1)} aria-label="Photo suivante" className="absolute right-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-offwhite/90 text-charcoal shadow-md hover:bg-white">
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="absolute bottom-3 left-3 rounded-full bg-charcoal/55 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
              {active + 1} / {count}
            </div>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide">
          {list.map((img, idx) => (
            <button
              key={`${img}-${idx}`}
              type="button"
              onClick={() => setActive(idx)}
              aria-label={`Afficher la photo ${idx + 1}`}
              aria-current={idx === active}
              className={cn(
                'relative h-16 w-16 shrink-0 overflow-hidden rounded-xl transition-all duration-200',
                idx === active ? 'ring-2 ring-brand-500 ring-offset-2 ring-offset-cream' : 'ring-1 ring-black/[0.08] opacity-70 hover:opacity-100',
              )}
            >
              <SmartImage src={img} fallbackSrc={fallbackSrc} alt="" sizes="64px" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
