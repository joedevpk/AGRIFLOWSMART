import { BrandLogo } from '@/components/brand/BrandLogo';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Menu, X, LogOut, Home, Bell } from 'lucide-react';
import { ConnectionBadge, SyncPill } from '@/components/agri/SyncStatus';
import { useAuth } from '@/contexts/auth-context';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import { ROLE_LABELS } from '@/lib/constants';
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications';
import { isNavActive, navFor, type NavSection } from './dashboard-nav';
import { useSeo } from '@/hooks/useSeo';

function Brand({ onClick }: { onClick?: () => void }) {
  return (
    <Link to="/" onClick={onClick} className="group inline-flex rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label="AgriFlow RDC, accueil">
      <BrandLogo tone="onLight" size="md" />
    </Link>
  );
}

interface NavListProps {
  sections: NavSection[];
  pathname: string;
  unread: number;
  onNavigate?: () => void;
}

function NavList({ sections, pathname, unread, onNavigate }: NavListProps) {
  return (
    <nav className="flex-1 overflow-y-auto overscroll-contain px-3 py-4" aria-label="Navigation du tableau de bord">
      {sections.map((section, i) => (
        <div key={section.title ?? i} className={cn(i > 0 && 'mt-5')}>
          {section.title && (
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-charcoal/40">{section.title}</p>
          )}
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = isNavActive(pathname, item.path);
              const Icon = item.icon;
              const count = item.badge === 'notifications' ? unread : 0;
              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'relative flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 lg:min-h-[40px]',
                      active ? 'bg-brand-50 text-brand-800' : 'text-charcoal/70 hover:bg-cream hover:text-charcoal',
                    )}
                  >
                    {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-brand-600" aria-hidden="true" />}
                    <Icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-brand-700' : 'text-charcoal/45')} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {count > 0 && (
                      <span className="rounded-full bg-accent-400 px-1.5 text-[11px] font-bold tabular-nums text-brand-950" aria-label={`${count} non lue${count > 1 ? 's' : ''}`}>
                        {count > 99 ? '99+' : count}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SidebarFooter({ onNavigate, onSignOut }: { onNavigate?: () => void; onSignOut: () => void }) {
  return (
    <div className="border-t border-brand-200 p-3">
      <Link to="/" onClick={onNavigate} className="flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-charcoal/70 hover:bg-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
        <Home className="h-[18px] w-[18px]" aria-hidden="true" /> Retour au site
      </Link>
      <button type="button" onClick={onSignOut} className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
        <LogOut className="h-[18px] w-[18px]" aria-hidden="true" /> Déconnexion
      </button>
    </div>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Tiroir mobile : dialogue modal accessible (Échap, piège de focus, restitution du focus, scroll verrouillé). */
function MobileDrawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex lg:hidden">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu du tableau de bord"
        className="flex h-full w-[min(20rem,85vw)] flex-col border-r border-brand-200 bg-offwhite shadow-lift animate-slide-up motion-reduce:animate-none"
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-brand-200 px-4">
          <Brand onClick={onClose} />
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Fermer le menu" className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
      <button type="button" tabIndex={-1} aria-label="Fermer le menu" className="flex-1 bg-black/40" onClick={onClose} />
    </div>
  );
}

export function DashboardLayout({ children, title }: { children: ReactNode; title?: string }) {
  useSeo({ title: `${title ?? 'Tableau de bord'} | AgriFlow RDC`, noindex: true });
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const unread = useUnreadNotifications();

  const sections = navFor(profile?.role);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // Ferme le tiroir après toute navigation.
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  const handleSignOut = () => { void signOut(); navigate('/'); };

  return (
    <div className="min-h-screen bg-cream">
      {/* Sidebar desktop */}
      <aside className="fixed bottom-0 left-0 top-0 z-20 hidden w-64 flex-col border-r border-brand-200 bg-offwhite lg:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-brand-200 px-5"><Brand /></div>
        <NavList sections={sections} pathname={location.pathname} unread={unread} />
        <SidebarFooter onSignOut={handleSignOut} />
      </aside>

      {/* Tiroir mobile */}
      <MobileDrawer open={drawerOpen} onClose={closeDrawer}>
        <NavList sections={sections} pathname={location.pathname} unread={unread} onNavigate={closeDrawer} />
        <SidebarFooter onNavigate={closeDrawer} onSignOut={handleSignOut} />
      </MobileDrawer>

      <div className="min-w-0 lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-brand-200 bg-offwhite px-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 lg:hidden" onClick={() => setDrawerOpen(true)} aria-label="Ouvrir le menu" aria-haspopup="dialog" aria-expanded={drawerOpen}>
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <nav aria-label="Fil d'Ariane" className="flex min-w-0 items-center gap-2 text-sm">
              <Link to="/dashboard" className="hidden shrink-0 text-charcoal/50 hover:text-charcoal sm:inline">AgriFlow</Link>
              {title && <span className="hidden text-charcoal/30 sm:inline" aria-hidden="true">/</span>}
              {title && <h1 className="truncate text-base font-semibold text-charcoal sm:text-lg">{title}</h1>}
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <div className="hidden items-center gap-2 md:flex"><SyncPill /><ConnectionBadge /></div>
            <div className="md:hidden"><ConnectionBadge compact /></div>
            <Link to="/notifications" aria-label={unread > 0 ? `Notifications (${unread} non lue${unread > 1 ? 's' : ''})` : 'Notifications'} className="relative flex h-11 w-11 items-center justify-center rounded-lg hover:bg-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
              <Bell className="h-5 w-5 text-charcoal/70" aria-hidden="true" />
              {unread > 0 && <span className="absolute right-1.5 top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent-400 px-1 text-[10px] font-bold tabular-nums text-brand-950">{unread > 9 ? '9+' : unread}</span>}
            </Link>
            <Link to="/profile" aria-label="Mon profil" className="flex min-h-[44px] items-center gap-2 rounded-lg px-1 hover:bg-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
              <Avatar name={profile?.full_name ?? 'Utilisateur'} src={profile?.avatar_url} size="sm" />
              <span className="hidden max-w-[10rem] flex-col leading-tight md:flex">
                <span className="truncate text-sm font-medium text-charcoal/80">{profile?.full_name ?? 'Utilisateur'}</span>
                <span className="text-[10px] text-charcoal/45">{profile ? ROLE_LABELS[profile.role] : ''}</span>
              </span>
            </Link>
          </div>
        </header>
        <main className="mx-auto min-w-0 max-w-7xl animate-fade-in p-4 motion-reduce:animate-none sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
