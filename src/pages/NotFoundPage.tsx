import { Link } from 'react-router-dom';
import { Sprout, Home, Store } from 'lucide-react';
import { Header, Footer } from '@/components/layout/Header';
import { buttonStyles } from '@/components/ui';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col bg-cream dark:bg-charcoal transition-colors">
      <Header />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-white/5">
          <Sprout className="h-8 w-8" aria-hidden="true" />
        </div>
        <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">Erreur 404</p>
        <h1 className="mt-2 text-2xl font-extrabold text-charcoal dark:text-cream sm:text-3xl">
          Page introuvable
        </h1>
        <p className="mt-3 text-sm text-charcoal/60 dark:text-cream/60">
          Cette page n'existe pas ou plus. Elle a peut-être été déplacée, ou l'adresse comporte une erreur.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link to="/" className={buttonStyles({ variant: 'primary', size: 'lg' })}>
            <Home className="h-4 w-4" aria-hidden="true" /> Retour à l'accueil
          </Link>
          <Link to="/marketplace" className={buttonStyles({ variant: 'outline', size: 'lg' })}>
            <Store className="h-4 w-4" aria-hidden="true" /> Explorer les produits
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
