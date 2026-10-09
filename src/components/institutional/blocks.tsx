import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { CTASection } from '@/components/ui/CTASection';

export interface Feature { icon: LucideIcon; title: string; text: string }

export function Section({ title, intro, children, tone = 'plain' }: { title?: string; intro?: string; children: ReactNode; tone?: 'plain' | 'soft' }) {
  return (
    <section className={tone === 'soft' ? 'bg-gradient-to-b from-brand-50/60 to-offwhite py-14 sm:py-20' : 'py-14 sm:py-20'}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {title && (
          <div className="mb-8 max-w-2xl sm:mb-12">
            <h2 className="text-2xl font-bold tracking-tight text-charcoal text-balance sm:text-3xl">{title}</h2>
            {intro && <p className="mt-3 text-base text-charcoal/65">{intro}</p>}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

export function FeatureGrid({ features }: { features: Feature[] }) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {features.map((f) => (
        <li key={f.title} className="rounded-2xl border border-black/[0.06] bg-offwhite p-5 shadow-card">
          <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><f.icon className="h-5 w-5" aria-hidden="true" /></span>
          <h3 className="text-base font-semibold text-charcoal">{f.title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-charcoal/65">{f.text}</p>
        </li>
      ))}
    </ul>
  );
}

export interface Cta { label: string; to: string; variant?: 'primary' | 'outline' | 'sun' }

/** Bandeau final : délègue à `CTASection` (un seul composant d'appel à l'action pour toute la plateforme). */
export function CtaBand({ title, text, actions }: { title: string; text?: string; actions: Cta[] }) {
  const [primary, secondary] = actions;
  return <CTASection title={title} description={text} primary={{ label: primary.label, to: primary.to }} secondary={secondary ? { label: secondary.label, to: secondary.to } : undefined} />;
}

/** Encadré d'honnêteté : ce qui reste manuel ou non disponible. */
export function Notice({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-accent-300 bg-accent-50 px-4 py-3 text-sm text-accent-700">{children}</p>;
}
