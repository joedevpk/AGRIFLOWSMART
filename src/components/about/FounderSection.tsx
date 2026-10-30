import { ExternalLink } from 'lucide-react';
import { FOUNDER } from '@/lib/founder';

/** Présentation sobre du créateur du projet. La photo est affichée telle quelle (recadrée, jamais déformée ni retouchée). */
export function FounderSection({ headingId = 'createur-titre' }: { headingId?: string }) {
  const { photo } = FOUNDER;
  return (
    <section aria-labelledby={headingId} className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 items-center gap-8 rounded-3xl border border-black/[0.06] bg-offwhite p-6 shadow-card sm:grid-cols-[minmax(0,15rem)_1fr] sm:gap-10 sm:p-8 dark:border-white/10 dark:bg-charcoal/60">
        <figure className="mx-auto w-full max-w-[15rem] sm:max-w-none">
          <picture>
            <source srcSet={photo.webp} type="image/webp" />
            <img
              src={photo.jpg}
              alt={photo.alt}
              width={photo.width}
              height={photo.height}
              loading="lazy"
              decoding="async"
              className="aspect-[4/5] w-full rounded-2xl object-cover object-top shadow-card ring-1 ring-black/[0.06]"
            />
          </picture>
        </figure>
        <div className="min-w-0 text-center sm:text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-300">Le créateur du projet</p>
          <h2 id={headingId} className="mt-2 text-2xl font-bold tracking-tight text-charcoal sm:text-3xl dark:text-cream">{FOUNDER.name}</h2>
          <p className="mt-1 text-sm font-medium text-accent-700 dark:text-accent-400">{FOUNDER.role}</p>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-charcoal/70 dark:text-cream/70">
            {FOUNDER.bio.map((p) => <p key={p}>{p}</p>)}
          </div>
          {FOUNDER.links.length > 0 && (
            <ul className="mt-5 flex flex-wrap justify-center gap-3 sm:justify-start">
              {FOUNDER.links.map((l) => (
                <li key={l.href}>
                  <a href={l.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-black/[0.08] px-3 text-sm font-medium text-brand-700 hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-300">
                    {l.label}<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
