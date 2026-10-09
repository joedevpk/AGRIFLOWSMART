import { Link, useLocation } from 'react-router-dom';
import { Home, Store, ShoppingBag, MessageSquare, User } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { cn } from '@/lib/utils';

/**
 * Navigation mobile persistante inspirée des marketplaces modernes
 * (Akatare). 5 éléments maximum, icône + label, position fixed bottom.
 * Cachée sur desktop (md:hidden) et sur les écrans d'authentification.
 */
export function BottomNav() {
  const location = useLocation();
  const { user, profile } = useAuth();

  const ordersPath = profile?.role === 'buyer' ? '/buyer/orders' : '/producer/orders';

  const items = [
    { label: 'Accueil', path: '/', icon: Home, match: (p: string) => p === '/' },
    { label: 'Marketplace', path: '/marketplace', icon: Store, match: (p: string) => p.startsWith('/marketplace') },
    {
      label: 'Commandes',
      path: user ? ordersPath : '/login',
      icon: ShoppingBag,
      match: (p: string) => p.includes('/orders'),
    },
    {
      label: 'Messages',
      path: user ? '/messages' : '/login',
      icon: MessageSquare,
      match: (p: string) => p.startsWith('/messages'),
    },
    {
      label: 'Profil',
      path: user ? '/profile' : '/login',
      icon: User,
      match: (p: string) => p === '/profile' || p === '/login' || p === '/register',
    },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-black/[0.06] bg-offwhite/95 backdrop-blur-sm pb-safe shadow-[0_-2px_12px_rgba(23,59,36,0.06)]" aria-label="Navigation principale">
      <div className="grid grid-cols-5">
        {items.map((item) => {
          const active = item.match(location.pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              to={item.path}
              aria-current={active ? 'page' : undefined}
              className="flex h-14 min-w-0 flex-col items-center justify-center gap-1 px-0.5 focus:outline-none focus-visible:bg-brand-50"
            >
              <Icon
                className={cn('h-5 w-5 transition-colors', active ? 'text-brand-600' : 'text-charcoal/40')}
                strokeWidth={active ? 2.4 : 2}
              />
              <span
                className={cn(
                  'max-w-full truncate text-[10.5px] font-medium transition-colors',
                  active ? 'text-brand-700' : 'text-charcoal/40',
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
