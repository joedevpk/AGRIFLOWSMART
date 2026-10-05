import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LifeBuoy, Search, ChevronDown, Mail } from 'lucide-react';
import { Header, Footer } from '@/components/layout/Header';
import { useSeo } from '@/hooks/useSeo';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { FAQ_CATEGORY_LABELS, FAQ_ITEMS, type FaqCategory } from '@/lib/faq';
import { normalizeText } from '@/lib/agri-match';
import { buttonStyles } from '@/components/ui/button-styles';
import { PAGE_IMAGES } from '@/lib/image-config';
import { cn } from '@/lib/utils';

export function HelpPage() {
  useSeo({
    title: 'Centre d\'aide | AgriFlow RDC',
    description: 'Réponses aux questions fréquentes sur AgriFlow RDC : compte, marketplace, commandes, paiement, livraison.',
    image: PAGE_IMAGES.home.url,
    imageAlt: PAGE_IMAGES.home.alt,
  });
  const [query, setQuery] = useState('');
  const [params] = useSearchParams();
  const initial = params.get('cat');
  const [category, setCategory] = useState<FaqCategory | 'all'>(initial && initial in FAQ_CATEGORY_LABELS ? (initial as FaqCategory) : 'all');
  const debounced = useDebouncedValue(query, 150);

  const items = useMemo(() => {
    const q = normalizeText(debounced);
    return FAQ_ITEMS.filter((f) => (category === 'all' || f.category === category) && (!q || normalizeText(`${f.question} ${f.answer}`).includes(q)));
  }, [debounced, category]);

  const categories = Object.keys(FAQ_CATEGORY_LABELS) as FaqCategory[];

  return (
    <div className="min-h-screen bg-cream dark:bg-charcoal">
      <Header />
      <main>
        <section className="bg-gradient-to-b from-brand-900 to-brand-800 py-14 text-center sm:py-20">
          <div className="mx-auto max-w-2xl px-4">
            <LifeBuoy className="mx-auto mb-4 h-10 w-10 text-accent-400" aria-hidden="true" />
            <h1 className="text-3xl font-bold text-white text-balance sm:text-4xl">Besoin d'aide ?</h1>
            <p className="mt-3 text-brand-100/85">Recherchez une réponse ou parcourez les questions par thème.</p>
            <div className="relative mt-6">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-charcoal/40" aria-hidden="true" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Rechercher dans la FAQ" placeholder="Ex. : paiement, commande, stock…" className="min-h-[52px] w-full rounded-2xl border-0 bg-offwhite pl-12 pr-4 text-base text-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400" />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
          <div className="-mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Catégories">
            {(['all', ...categories] as (FaqCategory | 'all')[]).map((c) => (
              <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)} className={cn('inline-flex min-h-[44px] shrink-0 items-center rounded-full border px-4 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500', category === c ? 'border-brand-600 bg-brand-600 text-white' : 'border-black/[0.08] bg-offwhite text-charcoal/70 hover:border-brand-300')}>
                {c === 'all' ? 'Toutes' : FAQ_CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>

          <p className="sr-only" role="status" aria-live="polite">{items.length} résultat{items.length > 1 ? 's' : ''}</p>
          {items.length === 0 ? (
            <div className="rounded-2xl border border-black/[0.06] bg-offwhite p-8 text-center">
              <p className="font-semibold text-charcoal">Aucune réponse ne correspond à votre recherche.</p>
              <p className="mt-1 text-sm text-charcoal/60">Essayez d'autres mots ou contactez-nous.</p>
              <Link to="/contact" className={buttonStyles({ variant: 'outline', className: 'mt-5' })}><Mail className="h-4 w-4" aria-hidden="true" /> Contacter AgriFlow</Link>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((f) => (
                <details key={f.id} className="group rounded-2xl border border-black/[0.06] bg-offwhite shadow-card open:border-brand-200">
                  <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-5 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0"><span className="block text-[11px] font-semibold uppercase tracking-wider text-brand-600">{FAQ_CATEGORY_LABELS[f.category]}</span><span className="block font-semibold text-charcoal">{f.question}</span></span>
                    <ChevronDown className="h-5 w-5 shrink-0 text-charcoal/40 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                  </summary>
                  <div className="px-5 pb-5 text-sm leading-relaxed text-charcoal/70">
                    <p>{f.answer}</p>
                    {f.link && <Link to={f.link.to} className="mt-3 inline-flex min-h-[44px] items-center font-medium text-brand-700 hover:text-brand-800">{f.link.label} →</Link>}
                  </div>
                </details>
              ))}
            </div>
          )}

          <div className="mt-10 rounded-2xl border border-brand-200 bg-brand-50 p-6 text-center">
            <p className="font-semibold text-charcoal">Vous ne trouvez pas votre réponse ?</p>
            <Link to="/contact" className={buttonStyles({ className: 'mt-4' })}>Contacter AgriFlow</Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
