import mark from './mark.json';
import { cn } from '@/lib/utils';

/**
 * Identité visuelle AgriFlow RDC — une feuille (production locale) posée sur une courbe qui file vers un point (circulation des
 * produits du producteur vers le marché), avec une petite étoile dorée en clin d'œil discret à la RDC.
 * La géométrie vient de `mark.json`, la même source que les fichiers générés par `scripts/build-brand.mjs` (public/brand/*, icônes Android).
 */
const C = mark.colors;

export function BrandMark({ className, container = C.forest }: { className?: string; container?: string }) {
  return (
    <svg viewBox={mark.viewBox} className={className} aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx={mark.radius} fill={container} />
      <path fill={C.fresh} d={mark.leaf} />
      <path d={mark.vein} stroke={C.forest} strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d={mark.flow} stroke={C.sage} strokeWidth="3.2" strokeLinecap="round" fill="none" />
      <circle cx={mark.node.cx} cy={mark.node.cy} r={mark.node.r} fill={C.gold} />
      <path fill={C.gold} d={mark.star} />
    </svg>
  );
}

type Tone = 'onDark' | 'onLight' | 'adaptive';
const SIZES = { sm: { box: 'h-8 w-8', name: 'text-base', rdc: 'text-[9px]' }, md: { box: 'h-9 w-9', name: 'text-lg', rdc: 'text-[10px]' }, lg: { box: 'h-11 w-11', name: 'text-xl', rdc: 'text-[11px]' } } as const;
const TONES: Record<Tone, { agri: string; flow: string; rdc: string; container: string }> = {
  onDark: { agri: 'text-white', flow: 'text-brand-300', rdc: 'text-accent-300', container: '#1D4A29' },
  onLight: { agri: 'text-brand-900', flow: 'text-brand-600', rdc: 'text-accent-600', container: C.forest },
  adaptive: { agri: 'text-brand-900 dark:text-cream', flow: 'text-brand-600 dark:text-brand-300', rdc: 'text-accent-600 dark:text-accent-400', container: C.forest },
};

/** Logo complet (marque + « AgriFlow » + « RDC ») ou marque seule (`showWordmark={false}`). Le lien parent porte le nom accessible. */
export function BrandLogo({ tone = 'onLight', size = 'md', showWordmark = true, className }: { tone?: Tone; size?: keyof typeof SIZES; showWordmark?: boolean; className?: string }) {
  const s = SIZES[size]; const t = TONES[tone];
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <BrandMark className={cn(s.box, 'shrink-0 transition-transform duration-200 group-hover:scale-105')} container={t.container} />
      {showWordmark && (
        <span className="flex flex-col leading-none" aria-hidden="true">
          <span className={cn(s.name, 'font-extrabold tracking-tight')}><span className={t.agri}>Agri</span><span className={t.flow}>Flow</span></span>
          <span className={cn(s.rdc, 'mt-1 font-bold uppercase tracking-[0.22em]', t.rdc)}>RDC</span>
        </span>
      )}
    </span>
  );
}
