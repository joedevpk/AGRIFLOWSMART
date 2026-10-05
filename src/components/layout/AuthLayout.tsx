import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Leaf, ArrowLeft } from 'lucide-react';
import { PAGE_IMAGES } from '@/lib/image-config';
import { useSeo } from '@/hooks/useSeo';

export function AuthLayout({ children, title, subtitle }: { children: ReactNode; title: string; subtitle: string }) {
  useSeo({ title: `${title} | AgriFlow RDC`, description: subtitle, noindex: true });
  const image = PAGE_IMAGES.auth;
  return (
    <div className="flex min-h-screen flex-col bg-cream dark:bg-night-900 lg:flex-row">
      {/* Mobile : bandeau image réduit, le formulaire reste prioritaire */}
      <div className="relative h-32 shrink-0 overflow-hidden sm:h-40 lg:hidden">
        <img src={image.url} alt={image.alt} loading="eager" className="absolute inset-0 h-full w-full object-cover object-center" />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-950/85 via-brand-900/40 to-brand-900/20" />
        <Link to="/" className="absolute bottom-3 left-4 flex items-center gap-2 text-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600"><Leaf className="h-4 w-4" aria-hidden="true" /></span>
          <span className="text-base font-bold">AgriFlow <span className="text-brand-200">RDC</span></span>
        </Link>
      </div>

      {/* Formulaire */}
      <div className="flex flex-1 flex-col px-4 py-8 sm:px-6 lg:px-12">
        <Link to="/" className="group mb-12 hidden items-center gap-2.5 lg:flex">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white transition-transform duration-200 group-hover:scale-105">
            <Leaf className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-lg font-bold text-charcoal dark:text-cream">AgriFlow</span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-brand-600 dark:text-brand-300">RDC</span>
          </span>
        </Link>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
          <Link to="/" className="mb-6 inline-flex min-h-[44px] items-center gap-1.5 text-sm text-charcoal/55 transition-colors duration-200 hover:text-brand-700 dark:text-cream/55 dark:hover:text-brand-200">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Retour à l'accueil
          </Link>
          <h1 className="text-2xl font-extrabold tracking-tight text-charcoal dark:text-cream sm:text-3xl">{title}</h1>
          <p className="mt-2 text-sm text-charcoal/60 dark:text-cream/60">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </div>

      {/* Desktop : grande image agricole */}
      <div className="relative hidden flex-1 lg:flex">
        <img src={image.url} alt={image.alt} loading="eager" className="absolute inset-0 h-full w-full object-cover object-center" />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-950/90 via-brand-900/35 to-brand-900/10" />
        <div className="relative flex flex-col justify-end p-12 text-white">
          <h2 className="max-w-md text-3xl font-extrabold leading-tight text-balance">Du producteur directement au marché.</h2>
          <p className="mt-3 max-w-md text-brand-100/85">
            AgriFlow RDC met en relation directe les producteurs agricoles et les acheteurs, sans intermédiaires.
          </p>
          <ul className="mt-6 space-y-1.5 text-sm text-brand-100/90">
            <li>Producteurs : publiez votre production et recevez des commandes.</li>
            <li>Acheteurs : recherchez, commandez et suivez votre livraison.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
