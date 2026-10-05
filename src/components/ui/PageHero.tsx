import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { ImageEntry } from '@/lib/image-config';

interface PageHeroProps {
  image: ImageEntry;
  badge?: string;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  className?: string;
}

/**
 * Bannière plein cadre avec photographie agricole réelle en fond,
 * utilisée pour donner une identité premium aux pages secondaires
 * (Comment ça marche, Producteurs, Acheteurs...).
 */
export function PageHero({ image, badge, title, subtitle, children, className }: PageHeroProps) {
  return (
    <section className={cn('relative overflow-hidden py-20 sm:py-28', className)}>
      <div className="absolute inset-0">
        <img
          src={image.url}
          alt=""
          className="h-full w-full object-cover"
          loading="eager"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-brand-950/88 via-brand-900/78 to-brand-800/65" />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-950/40 via-transparent to-transparent" />
      </div>
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
        {badge && (
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/20 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-brand-100 mb-4">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-400" />
            {badge}
          </span>
        )}
        <h1 className="text-3xl sm:text-5xl font-bold text-white tracking-tight text-balance">{title}</h1>
        {subtitle && (
          <p className="mt-4 text-lg text-brand-100/85 max-w-2xl mx-auto">{subtitle}</p>
        )}
        {children && <div className="mt-8">{children}</div>}
      </div>
    </section>
  );
}
