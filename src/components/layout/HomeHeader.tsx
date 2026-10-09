import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Bell, Leaf, LayoutDashboard, LogOut, Menu, Search, ShoppingCart, Sprout, X } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useCart } from '@/contexts/cart-context';
import { useLanguage } from '@/contexts/language-context';
import { buttonStyles } from '@/components/ui/button-styles';
import { Avatar } from '@/components/ui/Avatar';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications';
import { cn } from '@/lib/utils';

/** Seuil (px) de défilement à partir duquel la barre passe du transparent au fond plein. */
const SOLID_AFTER_SCROLL = 24;

/** Bouton contour sur fond sombre (classes complètes : pas de surcharge d'une variante existante). */
const OUTLINE_ON_DARK =
  'inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-white/25 px-6 text-base font-medium text-white transition-colors hover:border-white/40 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400';

interface HomeHeaderProps {
  /**
   * `overlay` (accueil) : fixe, transparente par-dessus le hero puis fond plein au défilement.
   * `solid` (pages internes) : collante, fond Forest Green plein dès le départ, dans le flux de la page.
   */
  variant?: 'overlay' | 'solid';
}

/**
 * Barre de navigation unique d'AgriFlow RDC (niveau SaaS / marketplace).
 * - Accueil : transparente par-dessus la photo du hero, puis fond Forest Green plein au défilement.
 * - Pages internes (via `Header`) : même barre, même liens, même tiroir, fond plein.
 * - Menu principal à partir de 1280 px ; en dessous : recherche, panier, CTA et tiroir animé.
 */
export function HomeHeader({ variant = 'overlay' }: HomeHeaderProps = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const { t } = useLanguage();
  const { count: cartCount } = useCart();
  const unread = useUnreadNotifications();

  const [scrolled, setScrolled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [query, setQuery] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const navLinks = [
    { label: t('nav.home'), path: '/' },
    { label: t('nav.marketplace'), path: '/marketplace' },
    { label: t('nav.howItWorks'), path: '/comment-ca-marche' },
    { label: t('nav.forProducers'), path: '/producers' },
    { label: t('nav.forEnterprises'), path: '/entreprises' },
  ];
  // Liens secondaires : uniquement dans le tiroir, pour ne perdre l'accès à aucune page existante.
  const moreLinks = [
    { label: t('nav.buyers'), path: '/buyers' },
    { label: t('nav.agrimatch'), path: '/buyer/requests' },
    { label: 'AgriGuide', path: '/agriguide' },
    { label: 'Coopératives', path: '/cooperatives' },
    { label: 'Centre d\'aide', path: '/help' },
    { label: 'Contact', path: '/contact' },
  ];
  // Raccourcis du compte, uniquement dans le tiroir : sans eux, un utilisateur connecté sur tablette
  // (nav basse masquée dès 768 px, menu compte réservé aux écrans >= 1280 px) n'atteint ni son profil ni ses commandes.
  const accountLinks = user
    ? [
        { label: 'Mon profil', path: '/profile' },
        { label: 'Mes commandes', path: profile?.role === 'buyer' ? '/buyer/orders' : '/producer/orders' },
        { label: 'Messages', path: '/messages' },
        { label: 'Paiements', path: '/payments' },
        { label: 'Livraisons', path: '/deliveries' },
        { label: 'Favoris', path: '/favorites' },
        ...(profile?.role === 'admin' ? [{ label: 'Administration', path: '/admin' }] : []),
      ]
    : [];
  // Un acheteur ne publie pas d'offre (SellerRoute) : on ne lui propose pas ce CTA.
  const showSellCta = profile?.role !== 'buyer';

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname === path || location.pathname.startsWith(`${path}/`);

  const solid = variant === 'solid' || scrolled || drawerOpen || searchOpen;

  const closeAll = useCallback(() => {
    setDrawerOpen(false);
    setSearchOpen(false);
    setUserMenu(false);
  }, []);

  // Transparent -> plein au défilement (écouteur passif, état recalculé une seule fois au montage).
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > SOLID_AFTER_SCROLL);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Tiroir : blocage du défilement de la page, Échap pour fermer, focus sur le bouton de fermeture,
  // fermeture automatique si l'écran s'élargit jusqu'au menu desktop.
  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false); };
    const onResize = () => { if (window.innerWidth >= 1280) setDrawerOpen(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    searchRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSearchOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    closeAll();
    navigate(q ? `/marketplace?q=${encodeURIComponent(q)}` : '/marketplace');
  };

  const iconBtn = 'flex h-11 w-11 max-[359px]:w-9 shrink-0 items-center justify-center rounded-xl text-white/90 transition-colors duration-200 hover:bg-white/10 hover:text-white';

  return (
    <>
      <header
        className={cn(
          variant === 'solid' ? 'sticky top-0' : 'fixed inset-x-0 top-0',
          'z-50 border-b text-white transition-[background-color,border-color,box-shadow] duration-300 ease-out',
          solid ? 'border-white/10 bg-brand-900 shadow-sm shadow-brand-950/30' : 'border-transparent bg-brand-900/0',
        )}
      >
        {/* Voile sombre discret tant que la barre est transparente : garantit la lisibilité sur la photo. */}
        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-brand-950/70 to-transparent transition-opacity duration-300',
            solid ? 'opacity-0' : 'opacity-100',
          )}
        />
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:h-[72px] lg:px-8">
          <Link to="/" onClick={closeAll} className="group flex shrink-0 items-center gap-2.5" aria-label="AgriFlow RDC, accueil">
            <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-offwhite text-brand-700 shadow-sm transition-transform group-hover:scale-105">
              <Leaf className="h-5 w-5" aria-hidden="true" />
              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-accent-400 ring-2 ring-brand-900" />
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-lg font-bold tracking-tight text-white">AgriFlow</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-300">RDC</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-0.5 xl:flex" aria-label="Navigation principale">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                aria-current={isActive(link.path) ? 'page' : undefined}
                className={cn(
                  'relative inline-flex h-10 items-center whitespace-nowrap rounded-lg px-2 text-sm font-medium transition-colors duration-200 2xl:px-2.5',
                  isActive(link.path) ? 'text-white' : 'text-white/75 hover:bg-white/10 hover:text-white',
                )}
              >
                {link.label}
                {isActive(link.path) && (
                  <span aria-hidden="true" className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full bg-accent-400 2xl:inset-x-2.5" />
                )}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={t('nav.search')}
              aria-expanded={searchOpen}
              onClick={() => { setDrawerOpen(false); setUserMenu(false); setSearchOpen((v) => !v); }}
              className={iconBtn}
            >
              {searchOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Search className="h-5 w-5" aria-hidden="true" />}
            </button>
            <Link
              to="/cart"
              onClick={closeAll}
              aria-label={cartCount > 0 ? `Panier, ${cartCount} produit${cartCount > 1 ? 's' : ''}` : 'Panier'}
              className={cn(iconBtn, 'relative')}
            >
              <ShoppingCart className="h-5 w-5" aria-hidden="true" />
              {cartCount > 0 && (
                <span className="absolute right-0.5 top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent-400 px-1 text-[11px] font-bold leading-none text-brand-950">
                  {cartCount > 99 ? '99+' : cartCount}
                </span>
              )}
            </Link>
            {user && (
              <Link
                to="/notifications"
                onClick={closeAll}
                aria-label={unread > 0 ? `Notifications, ${unread} non lue${unread > 1 ? 's' : ''}` : 'Notifications'}
                className={cn(iconBtn, 'relative')}
              >
                <Bell className="h-5 w-5" aria-hidden="true" />
                {unread > 0 && (
                  <span className="absolute right-0.5 top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent-400 px-1 text-[11px] font-bold leading-none text-brand-950">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </Link>
            )}
            {/* Thème et langue : icônes seules sur le menu desktop (labels disponibles dans le tiroir). */}
            <ThemeToggle onDark className="hidden xl:flex" />
            <LanguageSwitcher onDark iconOnly className="hidden xl:block" />

            {user ? (
              <>
                {showSellCta && (
                  <Link
                    to="/producer/products/new"
                    className={buttonStyles({ variant: 'sun', size: 'md', className: 'ml-2 hidden font-semibold 2xl:inline-flex' })}
                  >
                    {t('nav.sell')}
                  </Link>
                )}
                <div className="relative ml-1 hidden xl:block">
                  <button
                    type="button"
                    onClick={() => { setSearchOpen(false); setUserMenu((v) => !v); }}
                    aria-haspopup="menu"
                    aria-expanded={userMenu}
                    className="flex h-11 items-center gap-2 rounded-xl border border-white/25 px-2 transition-colors duration-200 hover:bg-white/10"
                  >
                    <Avatar name={profile?.full_name ?? 'User'} src={profile?.avatar_url} size="sm" />
                    <span className="hidden max-w-[96px] truncate text-sm font-medium text-white 2xl:inline">{profile?.full_name ?? t('nav.account')}</span>
                  </button>
                  {userMenu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setUserMenu(false)} />
                      <div className="absolute right-0 top-full z-20 mt-2 w-56 animate-scale-in rounded-xl border border-brand-200 bg-offwhite p-2 shadow-lg dark:border-white/10 dark:bg-charcoal">
                        {showSellCta && (
                          <Link to="/producer/products/new" onClick={closeAll} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-cream dark:text-accent-300 dark:hover:bg-white/5 2xl:hidden">
                            <Sprout className="h-4 w-4" aria-hidden="true" /> {t('nav.sell')}
                          </Link>
                        )}
                        <Link to="/dashboard" onClick={closeAll} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-charcoal/80 hover:bg-cream dark:text-cream/80 dark:hover:bg-white/5">
                          <LayoutDashboard className="h-4 w-4" aria-hidden="true" /> {t('nav.dashboard')}
                        </Link>
                        <Link to="/profile" onClick={closeAll} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-charcoal/80 hover:bg-cream dark:text-cream/80 dark:hover:bg-white/5">
                          <Avatar name={profile?.full_name ?? 'U'} src={profile?.avatar_url} size="xs" /> {t('nav.profile')}
                        </Link>
                        <button
                          type="button"
                          onClick={() => { signOut(); closeAll(); navigate('/'); }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                        >
                          <LogOut className="h-4 w-4" aria-hidden="true" /> {t('nav.logout')}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="ml-1 hidden h-11 items-center rounded-xl px-3 text-sm font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white xl:inline-flex"
                >
                  {t('nav.connection')}
                </Link>
                <Link
                  to="/register"
                  className={buttonStyles({ variant: 'sun', size: 'md', className: 'ml-1 hidden font-semibold sm:inline-flex' })}
                >
                  {t('nav.start')}
                </Link>
              </>
            )}

            <button
              type="button"
              aria-label="Ouvrir le menu"
              aria-expanded={drawerOpen}
              aria-controls="home-drawer"
              onClick={() => { setSearchOpen(false); setUserMenu(false); setDrawerOpen(true); }}
              className={cn(iconBtn, 'xl:hidden')}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Panneau de recherche : ouvre la marketplace avec le terme saisi. */}
        <div
          className={cn(
            'absolute inset-x-0 top-full border-b border-white/10 bg-brand-900 transition-[opacity,transform,visibility] duration-200 ease-out',
            searchOpen ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-2 opacity-0',
          )}
        >
          <form onSubmit={submitSearch} className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3 sm:px-6" role="search">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-charcoal/40" aria-hidden="true" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('search.placeholder')}
                aria-label={t('nav.search')}
                className="h-12 w-full rounded-xl border-0 bg-offwhite pl-12 pr-4 text-base text-charcoal sm:text-sm placeholder:text-charcoal/40 focus:outline-none focus:ring-4 focus:ring-accent-400/30"
              />
            </div>
            <button type="submit" className={buttonStyles({ variant: 'sun', size: 'lg', className: 'h-12 shrink-0 px-4 font-semibold sm:px-6' })}>
              <span className="hidden sm:inline">{t('search.button')}</span>
              <Search className="h-5 w-5 sm:hidden" aria-hidden="true" />
              <span className="sr-only sm:hidden">{t('search.button')}</span>
            </button>
          </form>
        </div>
      </header>

      {/* Tiroir mobile / tablette */}
      <div className={cn('fixed inset-0 z-[60] transition-[visibility] duration-0 xl:hidden', drawerOpen ? 'visible' : 'invisible delay-300')} aria-hidden={!drawerOpen}>
        <div
          onClick={() => setDrawerOpen(false)}
          className={cn('absolute inset-0 bg-brand-950/60 transition-opacity duration-300', drawerOpen ? 'opacity-100' : 'opacity-0')}
        />
        <aside
          id="home-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className={cn(
            'absolute inset-y-0 right-0 flex w-[88%] max-w-sm flex-col bg-brand-900 text-white shadow-2xl transition-transform duration-300 ease-out',
            drawerOpen ? 'translate-x-0' : 'translate-x-full',
          )}
        >
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-4">
            <span className="truncate text-sm font-semibold uppercase tracking-[0.18em] text-white/60">Menu</span>
            <div className="flex shrink-0 items-center gap-2">
              <ThemeToggle onDark />
              <LanguageSwitcher onDark />
              <button ref={closeRef} type="button" aria-label="Fermer le menu" onClick={() => setDrawerOpen(false)} className={iconBtn}>
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            <nav aria-label="Menu mobile" className="space-y-1">
              {navLinks.map((link, i) => (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={closeAll}
                  aria-current={isActive(link.path) ? 'page' : undefined}
                  style={{ transitionDelay: drawerOpen ? `${80 + i * 40}ms` : '0ms' }}
                  className={cn(
                    'flex min-h-[48px] items-center justify-between rounded-xl px-3 text-base font-medium transition-[opacity,transform,background-color] duration-300',
                    drawerOpen ? 'translate-x-0 opacity-100' : 'translate-x-3 opacity-0',
                    isActive(link.path) ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white',
                  )}
                >
                  {link.label}
                  {isActive(link.path) && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent-400" />}
                </Link>
              ))}
            </nav>

            {accountLinks.length > 0 && (
              <>
                <p className="mb-2 mt-6 px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Mon espace</p>
                <div className="space-y-0.5">
                  {accountLinks.map((link) => (
                    <Link
                      key={link.path}
                      to={link.path}
                      onClick={closeAll}
                      aria-current={isActive(link.path) ? 'page' : undefined}
                      className="flex min-h-[44px] items-center rounded-xl px-3 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </>
            )}

            <p className="mb-2 mt-6 px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Explorer</p>
            <div className="space-y-0.5">
              {moreLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={closeAll}
                  className="flex min-h-[44px] items-center rounded-xl px-3 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                >
                  {link.label}
                </Link>
              ))}
            </div>

          </div>

          <div className="shrink-0 space-y-2 border-t border-white/10 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {user ? (
              <>
                {showSellCta && (
                  <Link to="/producer/products/new" onClick={closeAll} className={buttonStyles({ variant: 'sun', size: 'lg', fullWidth: true, className: 'font-semibold' })}>
                    <Sprout className="h-5 w-5" aria-hidden="true" /> {t('nav.sell')}
                  </Link>
                )}
                <Link to="/dashboard" onClick={closeAll} className={OUTLINE_ON_DARK}>
                  <LayoutDashboard className="h-5 w-5" aria-hidden="true" /> {t('nav.dashboard')}
                </Link>
                <button
                  type="button"
                  onClick={() => { signOut(); closeAll(); navigate('/'); }}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl text-sm font-medium text-rose-200 hover:bg-white/10"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" /> {t('nav.logout')}
                </button>
              </>
            ) : (
              <>
                <Link to="/register" onClick={closeAll} className={buttonStyles({ variant: 'sun', size: 'lg', fullWidth: true, className: 'font-semibold' })}>
                  {t('nav.start')} <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </Link>
                <Link to="/login" onClick={closeAll} className={OUTLINE_ON_DARK}>
                  {t('nav.connection')}
                </Link>
              </>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
