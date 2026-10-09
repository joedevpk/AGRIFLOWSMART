import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronDown, Clock, ListTree, ShieldAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Header, Footer } from '@/components/layout/Header';
import { useSeo, type SeoOptions } from '@/hooks/useSeo';
import { LEGAL_PAGES, LEGAL_UPDATED_ISO, LEGAL_UPDATED_LABEL } from '@/lib/legal/meta';
import { cn } from '@/lib/utils';

export interface LegalSectionDef { id: string; title: string; content: ReactNode }

interface Props {
  seo: SeoOptions;
  icon: LucideIcon;
  title: string;
  intro: string;
  sections: LegalSectionDef[];
  /** Page en cours (pour la navigation croisée). */
  path: string;
  /** Affiche le bandeau « en attente de validation juridique ». */
  needsLegalReview?: boolean;
}

function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState(ids[0] ?? '');
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => e !== null);
    if (els.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActive(visible[0].target.id);
    }, { rootMargin: '-20% 0px -65% 0px' });
    els.forEach((e) => obs.observe(e));
    return () => obs.disconnect();
  }, [ids]);
  return active;
}

/**
 * Gabarit des pages de confiance : héro, retour, date de mise à jour, sommaire latéral sticky (desktop),
 * barre de sommaire sticky repliable (mobile), sections ancrées, navigation croisée.
 */
export function LegalLayout({ seo, icon: Icon, title, intro, sections, path, needsLegalReview = true }: Props) {
  useSeo(seo);
  const navigate = useNavigate();
  const [tocOpen, setTocOpen] = useState(false);
  const ids = sections.map((s) => s.id);
  const active = useActiveSection(ids);

  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1); else navigate('/');
  };

  return (
    <div className="min-h-screen bg-cream dark:bg-charcoal">
      <Header />
      <main>
        <section className="bg-gradient-to-b from-brand-900 to-brand-800 py-10 sm:py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <button type="button" onClick={goBack} className="mb-6 inline-flex min-h-[44px] items-center gap-2 rounded-xl px-3 text-sm font-medium text-brand-100 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Retour</button>
            <div className="flex items-start gap-4">
              <span className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-accent-400 sm:flex" aria-hidden="true"><Icon className="h-7 w-7" /></span>
              <div className="min-w-0">
                <h1 className="text-3xl font-bold tracking-tight text-white text-balance sm:text-4xl">{title}</h1>
                <p className="mt-3 max-w-2xl text-base leading-relaxed text-brand-100/90">{intro}</p>
                <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm text-brand-100"><Clock className="h-4 w-4" aria-hidden="true" /> Dernière mise à jour : <time dateTime={LEGAL_UPDATED_ISO}>{LEGAL_UPDATED_LABEL}</time></p>
              </div>
            </div>
          </div>
        </section>

        {/* Sommaire mobile / tablette : barre sticky repliable */}
        <div className="sticky top-16 z-30 border-b border-black/[0.08] bg-offwhite/95 backdrop-blur dark:bg-night-800/95 lg:hidden">
          <button type="button" aria-expanded={tocOpen} aria-controls="toc-mobile" onClick={() => setTocOpen((o) => !o)} className="mx-auto flex min-h-[48px] w-full max-w-6xl items-center justify-between gap-3 px-4 text-left text-sm font-semibold text-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 sm:px-6">
            <span className="inline-flex items-center gap-2"><ListTree className="h-4 w-4 text-brand-700 dark:text-brand-300" aria-hidden="true" /> Sommaire</span>
            <ChevronDown className={cn('h-5 w-5 transition-transform motion-reduce:transition-none', tocOpen && 'rotate-180')} aria-hidden="true" />
          </button>
          {tocOpen && (
            <nav id="toc-mobile" aria-label="Sommaire de la page" className="max-h-[60dvh] overflow-y-auto border-t border-black/[0.06] px-4 pb-3 sm:px-6">
              <ol className="mx-auto max-w-6xl">
                {sections.map((s, i) => (
                  <li key={s.id}><a href={`#${s.id}`} onClick={() => setTocOpen(false)} className="flex min-h-[44px] items-center gap-3 rounded-lg px-2 text-sm text-charcoal/80 hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-white/10"><span className="w-6 shrink-0 text-xs font-bold text-brand-700 dark:text-brand-300">{i + 1}.</span>{s.title}</a></li>
                ))}
              </ol>
            </nav>
          )}
        </div>

        <div className="mx-auto grid grid-cols-1 max-w-6xl gap-10 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-14 lg:px-8">
          <aside className="hidden lg:block">
            <nav aria-label="Sommaire de la page" className="sticky top-24 max-h-[calc(100dvh-8rem)] overflow-y-auto rounded-2xl border border-black/[0.06] bg-offwhite p-4 shadow-card">
              <p className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-brand-700 dark:text-brand-300">Sommaire</p>
              <ol className="space-y-0.5">
                {sections.map((s, i) => (
                  <li key={s.id}><a href={`#${s.id}`} aria-current={active === s.id ? 'location' : undefined} className={cn('flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm leading-snug focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500', active === s.id ? 'bg-brand-50 font-semibold text-brand-800' : 'text-charcoal/70 hover:bg-brand-50/60 hover:text-charcoal dark:hover:bg-white/10')}><span className="w-5 shrink-0 text-xs font-bold text-brand-700 dark:text-brand-300">{i + 1}.</span><span>{s.title}</span></a></li>
                ))}
              </ol>
            </nav>
          </aside>

          <article className="min-w-0">
            {needsLegalReview && (
              <div role="note" className="mb-8 flex gap-3 rounded-2xl border border-accent-400 bg-accent-50 p-4 text-sm text-amber-900">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <p className="leading-relaxed"><span className="font-bold">Version en attente de validation juridique.</span> Ce texte décrit le fonctionnement actuel d'AgriFlow. Les éléments encadrés « TODO » ou « À configurer » doivent être complétés avant l'ouverture au public.</p>
              </div>
            )}
            <div className="space-y-12 sm:space-y-14">
              {sections.map((s, i) => (
                <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-36 lg:scroll-mt-28">
                  <h2 id={`${s.id}-h`} className="flex items-baseline gap-3 text-xl font-bold tracking-tight text-charcoal text-balance sm:text-2xl"><span className="text-brand-600 dark:text-brand-300">{i + 1}.</span><span>{s.title}</span></h2>
                  <div className="legal-prose mt-4">{s.content}</div>
                </section>
              ))}
            </div>

            <nav aria-label="Autres documents" className="mt-16 rounded-2xl border border-black/[0.06] bg-offwhite p-5 sm:p-6">
              <p className="text-sm font-semibold text-charcoal">Voir aussi</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {LEGAL_PAGES.filter((p) => p.to !== path).map((p) => (
                  <li key={p.to}><Link to={p.to} className="inline-flex min-h-[44px] items-center rounded-full border border-brand-200 px-4 text-sm font-medium text-brand-800 hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-white/20 dark:text-brand-200 dark:hover:bg-white/10">{p.label}</Link></li>
                ))}
                <li><Link to="/contact" className="inline-flex min-h-[44px] items-center rounded-full border border-brand-200 px-4 text-sm font-medium text-brand-800 hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-white/20 dark:text-brand-200 dark:hover:bg-white/10">Contact</Link></li>
              </ul>
            </nav>
          </article>
        </div>
      </main>
      <Footer />
    </div>
  );
}
