import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';

interface Action { label: string; to: string }
const ACTIONS: Record<string, Action[]> = {
  producer: [{ label: 'Publier une offre', to: '/producer/products/new' }, { label: 'Mes commandes', to: '/producer/orders' }, { label: 'Mon tableau de bord', to: '/dashboard' }],
  cooperative: [{ label: 'Publier une offre', to: '/producer/products/new' }, { label: 'Mes commandes', to: '/producer/orders' }, { label: 'Mon tableau de bord', to: '/dashboard' }],
  buyer: [{ label: 'Explorer la marketplace', to: '/marketplace' }, { label: 'Suivre mes commandes', to: '/buyer/orders' }, { label: 'Mes favoris', to: '/favorites' }],
  admin: [{ label: 'Administration', to: '/admin' }, { label: 'Finance', to: '/admin/finance' }, { label: 'Commissions', to: '/admin/commissions' }],
};

/** Bandeau d'accès rapide affiché uniquement aux utilisateurs connectés, selon leur rôle réel. Rien n'est affiché sinon. */
export function WelcomeStrip() {
  const { user, profile } = useAuth();
  if (!user || !profile) return null;
  const actions = ACTIONS[profile.role];
  if (!actions) return null;
  const first = profile.full_name?.trim().split(/\s+/)[0];
  return (
    <section aria-label="Accès rapide" className="border-b border-black/[0.06] bg-offwhite dark:border-white/10 dark:bg-charcoal/70">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p className="text-sm font-semibold text-charcoal dark:text-cream">{first ? `Bonjour, ${first}` : 'Bonjour'}<span className="font-normal text-charcoal/60 dark:text-cream/60"> — reprenez où vous vous êtes arrêté.</span></p>
        <ul className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <li key={a.to}>
              <Link to={a.to} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-brand-200 bg-white px-3.5 text-sm font-semibold text-brand-800 transition-colors hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-white/15 dark:bg-white/5 dark:text-brand-200">
                {a.label}<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
