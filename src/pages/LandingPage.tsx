import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useSeo } from '@/hooks/useSeo';
import {
  ArrowRight, Search, PackageCheck, ShoppingCart, Truck,
  MapPin, TrendingUp, ShoppingBag, Wheat, Leaf,
  Store, Factory, Building2, CheckCircle2, Quote,
} from 'lucide-react';
import { Footer } from '@/components/layout/Header';
import { HomeHeader } from '@/components/layout/HomeHeader';
import { buttonStyles } from '@/components/ui/button-styles';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { PAGE_IMAGES, HOME_HERO_CAROUSEL, getCategoryImage } from '@/lib/image-config';
import { HeroCarousel } from '@/components/ui/HeroCarousel';
import { CATEGORIES } from '@/lib/constants';
import { useLanguage } from '@/contexts/language-context';
import { useAuth } from '@/contexts/auth-context';

export function LandingPage() {
  useSeo({
    title: 'AgriFlow RDC — Du producteur au marché, simplement',
    description: 'AgriFlow RDC connecte les producteurs agricoles congolais aux acheteurs : marketplace, Agri-Match, suivi de parcelle et commandes.',
    image: PAGE_IMAGES.home.url,
    imageAlt: PAGE_IMAGES.home.alt,
  });
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const { t } = useLanguage();
  const { user, profile } = useAuth();
  // Un acheteur ne publie pas d'offre : on l'envoie vers la création de compte comme avant.
  const sellHref = user && profile?.role !== 'buyer' ? '/producer/products/new' : '/register';

  const goToMarketplace = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(query ? `/marketplace?q=${encodeURIComponent(query)}` : '/marketplace');
  };

  return (
    <div className="min-h-screen bg-cream dark:bg-charcoal transition-colors">
      <HomeHeader />

      {/* Hero — photo agricole plein écran (carrousel existant), overlay vert sombre, navbar transparente au-dessus */}
      <section className="relative isolate overflow-hidden bg-brand-950 text-white" aria-labelledby="hero-title">
        <div className="absolute inset-0">
          <HeroCarousel variant="background" images={HOME_HERO_CAROUSEL} intervalMs={5000} />
        </div>
        {/* Overlay : teinte uniforme + un seul voile directionnel pour la lisibilité du texte */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-brand-950/50" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-brand-950/80 via-brand-950/25 to-transparent lg:bg-gradient-to-r lg:from-brand-950/75 lg:via-brand-950/30 lg:to-transparent" />

        <div className="pointer-events-none relative mx-auto flex min-h-[100svh] max-w-7xl flex-col justify-center px-4 pb-28 pt-28 sm:px-6 md:pb-24 lg:px-8 lg:pt-32">
          <div className="max-w-2xl">
            <p className="mb-5 flex animate-fade-up items-center gap-3 text-sm font-semibold uppercase tracking-[0.2em] text-accent-300 [animation-fill-mode:backwards]">
              <span aria-hidden="true" className="h-px w-8 bg-accent-400" />
              AgriFlow RDC
            </p>
            <h1
              id="hero-title"
              className="animate-fade-up text-[2.25rem] font-extrabold leading-[1.08] tracking-tight text-balance [animation-delay:80ms] [animation-fill-mode:backwards] sm:text-5xl lg:text-[3.6rem]"
            >
              {t('hero.title')}
            </h1>
            <p className="mt-5 max-w-lg animate-fade-up text-base leading-relaxed text-white/85 [animation-delay:160ms] [animation-fill-mode:backwards] sm:text-lg">
              {t('hero.subtitle')}
            </p>
            <div className="mt-8 flex animate-fade-up flex-col gap-3 [animation-delay:240ms] [animation-fill-mode:backwards] sm:flex-row">
              <Link
                to="/marketplace"
                className={buttonStyles({ variant: 'sun', size: 'lg', fullWidth: true, className: 'pointer-events-auto group font-semibold sm:w-auto sm:min-h-[56px] sm:px-8 sm:text-lg' })}
              >
                {t('hero.ctaPrimary')}
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </Link>
              <Link
                to={sellHref}
                className="pointer-events-auto inline-flex min-h-[48px] w-full items-center justify-center whitespace-nowrap rounded-xl border border-white/40 px-6 text-base font-semibold text-white transition-colors hover:border-white/70 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-950 sm:min-h-[56px] sm:w-auto sm:px-8 sm:text-lg"
              >
                {t('hero.ctaSecondary')}
              </Link>
            </div>

            {/* Chaîne directe : qui, pourquoi, comment (contenu d'origine, sans carte) */}
            <div className="mt-10 max-w-xl animate-fade-up border-t border-white/20 pt-5 [animation-delay:320ms] [animation-fill-mode:backwards]">
              <ul className="grid grid-cols-3 gap-3 sm:gap-6">
                {[
                  { icon: <Wheat className="h-5 w-5" aria-hidden="true" />, title: 'Producteur', desc: 'Publie sa production' },
                  { icon: <Leaf className="h-5 w-5" aria-hidden="true" />, title: 'AgriFlow RDC', desc: 'Mise en relation' },
                  { icon: <ShoppingBag className="h-5 w-5" aria-hidden="true" />, title: 'Acheteur', desc: 'Commande et reçoit' },
                ].map((step) => (
                  <li key={step.title} className="min-w-0">
                    <span className="text-accent-300">{step.icon}</span>
                    <p className="mt-2 text-sm font-semibold leading-tight">{step.title}</p>
                    <p className="mt-0.5 text-xs leading-snug text-white/70">{step.desc}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-white/65">Sans intermédiaires entre celui qui produit et celui qui achète.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Search-first experience */}
      <section className="py-14 sm:py-16 bg-brand-900">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            {t('search.heading')}
          </h2>
          <form onSubmit={goToMarketplace} className="mt-6 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-charcoal/35" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('search.placeholder')}
                className="w-full rounded-2xl border-0 bg-offwhite pl-12 pr-4 py-4 text-sm text-charcoal placeholder:text-charcoal/35 shadow-lift focus:outline-none focus:ring-4 focus:ring-accent-400/30"
              />
            </div>
            <Button type="submit" size="xl" variant="sun" className="font-semibold">
              {t('search.button')}
            </Button>
          </form>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {['Maïs', 'Manioc', 'Tomate', 'Café', 'Cacao', 'Légumes'].map((label) => (
              <Link
                key={label}
                to={`/marketplace?q=${encodeURIComponent(label)}`}
                className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <Badge variant="brand" className="mb-4">Comment AgriFlow fonctionne</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-charcoal tracking-tight">
              Du producteur à votre table, en quatre étapes
            </h2>
            <p className="mt-4 text-lg text-charcoal/50">
              Une plateforme simple qui élimine les intermédiaires et rapproche l'offre de la demande.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { num: '01', title: 'Publiez', desc: 'Le producteur publie sa production : produit, quantité, prix, localisation.', icon: <PackageCheck className="h-6 w-6" /> },
              { num: '02', title: 'Trouvez', desc: 'L\'acheteur recherche et trouve les offres qui correspondent à ses besoins.', icon: <Search className="h-6 w-6" /> },
              { num: '03', title: 'Commandez', desc: 'L\'acheteur commande la quantité souhaitée et choisit le mode de paiement.', icon: <ShoppingCart className="h-6 w-6" /> },
              { num: '04', title: 'Recevez', desc: 'Le producteur confirme, prépare et livre. Vous suivez chaque étape de la commande.', icon: <Truck className="h-6 w-6" /> },
            ].map((step) => (
              <div key={step.num} className="group relative rounded-2xl border border-black/[0.06] bg-offwhite p-6 shadow-card transition-all hover:shadow-card-hover hover:border-brand-200">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 mb-4 transition-colors group-hover:bg-brand-500 group-hover:text-white">
                  {step.icon}
                </div>
                <span className="text-xs font-bold text-brand-300 tracking-wider">{step.num}</span>
                <h3 className="mt-1 text-lg font-semibold text-charcoal">{step.title}</h3>
                <p className="mt-2 text-sm text-charcoal/50 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* De la parcelle au marché — AgriGuide, Ma Parcelle, Calendrier viennent renforcer le cœur Producteur ↔ Acheteur */}
      <section className="py-20 sm:py-28 bg-brand-900 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <Badge variant="brand" className="mb-4 border-white/20 bg-white/10 text-white">Accompagner le producteur</Badge>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">De la parcelle au marché</h2>
            <p className="mt-4 text-lg text-white/65">AgriGuide, Ma Parcelle et le calendrier agricole aident le producteur à mieux produire — pour vendre plus facilement sur AgriFlow.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { n: 1, title: 'Analysez votre parcelle', desc: 'Zone, superficie, culture envisagée : obtenez un indice d\'aptitude indicatif.' },
              { n: 2, title: 'Apprenez à mieux produire', desc: 'Des fiches AgriGuide simples, étape par étape, pour chaque culture.' },
              { n: 3, title: 'Planifiez votre culture', desc: 'Le calendrier agricole indique les périodes indicatives de semis et de récolte.' },
              { n: 4, title: 'Publiez votre production', desc: 'Quantité, qualité, disponibilité : votre offre devient visible sur le marché.' },
              { n: 5, title: 'Trouvez des acheteurs', desc: 'Agri-Match rapproche votre offre des demandes d\'achat ouvertes.' },
              { n: 6, title: 'Vendez et livrez', desc: 'Commande, paiement et livraison suivis de bout en bout.' },
            ].map((s) => (
              <div key={s.n} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <span className="text-xs font-bold tracking-wider text-accent-300">{String(s.n).padStart(2, '0')}</span>
                <h3 className="mt-1 font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm text-white/60">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link to="/agriguide"><Button variant="sun" size="lg">Découvrir AgriGuide</Button></Link>
            <Link to={user ? '/plots' : '/register'}><Button variant="outline" size="lg" className="border-white/30 text-white hover:bg-white/10">Ma Parcelle</Button></Link>
          </div>
        </div>
      </section>

      {/* Explore productions */}
      <section className="py-20 sm:py-28 bg-sage/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 mb-12">
            <div>
              <Badge variant="brand" className="mb-4">Explorez les productions</Badge>
              <h2 className="text-3xl sm:text-4xl font-bold text-charcoal tracking-tight">
                Les produits agricoles de la RDC
              </h2>
            </div>
            <Link to="/marketplace">
              <Button variant="outline" className="group">
                Voir tout <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4">
            {CATEGORIES.map((cat) => (
              <Link
                key={cat.id}
                to={`/marketplace?category=${cat.id}`}
                className="group relative overflow-hidden rounded-2xl border border-black/[0.06] bg-offwhite shadow-card transition-all hover:shadow-card-hover hover:-translate-y-0.5"
              >
                <div className="aspect-square overflow-hidden">
                  <img
                    src={getCategoryImage(cat.id)}
                    alt={cat.label}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <p className="text-sm font-semibold text-white">{cat.label}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Marketplace features */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <Badge variant="brand" className="mb-4">Marketplace</Badge>
              <h2 className="text-3xl sm:text-4xl font-bold text-charcoal tracking-tight">
                Une marketplace pensée pour la réalité du terrain
              </h2>
              <p className="mt-4 text-lg text-charcoal/50">
                Chaque production indique sa localisation, sa disponibilité, sa quantité et son prix.
                Les acheteurs commandent directement, les producteurs vendent sans intermédiaire.
              </p>
              <div className="mt-8 grid sm:grid-cols-2 gap-4">
                {[
                  { icon: <MapPin className="h-5 w-5" />, label: 'Localisation précise' },
                  { icon: <PackageCheck className="h-5 w-5" />, label: 'Disponibilité indiquée par le producteur' },
                  { icon: <TrendingUp className="h-5 w-5" />, label: 'Prix transparent' },
                  { icon: <ShoppingCart className="h-5 w-5" />, label: 'Commande directe' },
                  { icon: <CheckCircle2 className="h-5 w-5" />, label: 'Paiement sécurisé (CinetPay) ou à la livraison' },
                  { icon: <Truck className="h-5 w-5" />, label: 'Suivi de commande et de livraison' },
                ].map((f) => (
                  <div key={f.label} className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                      {f.icon}
                    </div>
                    <span className="text-sm font-medium text-charcoal/70">{f.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="rounded-3xl overflow-hidden shadow-2xl">
                <img
                  src={PAGE_IMAGES.markets.url}
                  alt={PAGE_IMAGES.markets.alt}
                  loading="lazy"
                  className="w-full h-[280px] sm:h-[400px] object-cover"
                />
              </div>
              <div className="absolute -bottom-6 -left-6 hidden sm:block rounded-2xl bg-offwhite border border-black/[0.06] shadow-lift p-5 max-w-xs">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-charcoal/40 mb-2">Illustration — suivi d'une commande</p>
                <ol className="space-y-1.5 text-sm text-charcoal/70">
                  {['Confirmée par le producteur', 'En préparation', 'Livrée à l\'acheteur'].map((step) => (
                    <li key={step} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> {step}</li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* For producers */}
      <section className="relative overflow-hidden py-20 sm:py-28">
        <div className="absolute inset-0">
          <img src={PAGE_IMAGES.producerCta.url} alt={PAGE_IMAGES.producerCta.alt} loading="lazy" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-brand-950/92 to-brand-900/70" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-xl">
            <Badge variant="brand" className="mb-4 bg-white/10 text-brand-100 border-white/20">Pour les producteurs</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
              Transformez votre production en opportunité commerciale
            </h2>
            <p className="mt-4 text-lg text-brand-100/90">
              Publiez vos récoltes, recevez des commandes directement des acheteurs, et gardez le contrôle sur vos prix.
              AgriFlow s'occupe de la mise en relation.
            </p>
            <div className="mt-8">
              <Link to="/register">
                <Button size="xl" className="group">
                  Publier ma production
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* For buyers */}
      <section className="py-20 sm:py-28 bg-sage/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <Badge variant="brand" className="mb-4">Pour les acheteurs</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-charcoal tracking-tight">
              Trouvez le bon fournisseur, au bon prix
            </h2>
            <p className="mt-4 text-lg text-charcoal/50">
              Restaurants, marchés, grossistes, agro-industries : accédez directement aux producteurs.
            </p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: <Store className="h-7 w-7" />, label: 'Restaurants', desc: 'Approvisionnez votre cuisine' },
              { icon: <ShoppingBag className="h-7 w-7" />, label: 'Marchés', desc: 'Diversifiez vos étals' },
              { icon: <Factory className="h-7 w-7" />, label: 'Grossistes', desc: 'Achetez en grande quantité' },
              { icon: <Building2 className="h-7 w-7" />, label: 'Agro-industries', desc: 'Sécurisez vos approvisionnements' },
            ].map((buyer) => (
              <div key={buyer.label} className="group rounded-2xl border border-black/[0.06] bg-offwhite p-6 shadow-card transition-all hover:shadow-card-hover hover:border-brand-200">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 mb-4 transition-colors group-hover:bg-brand-500 group-hover:text-white">
                  {buyer.icon}
                </div>
                <h3 className="text-base font-semibold text-charcoal">{buyer.label}</h3>
                <p className="mt-1 text-sm text-charcoal/50">{buyer.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link to="/marketplace">
              <Button size="lg" className="group">
                Trouver un fournisseur
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Agri-Match */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <Badge variant="brand" className="mb-4">Agri-Match</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-charcoal tracking-tight">
              Trouvez le producteur qui répond à votre besoin
            </h2>
            <p className="mt-4 text-lg text-charcoal/50">
              Publiez une demande d'achat : Agri-Match compare produit, quantité, localisation et disponibilité, et vous explique pourquoi un producteur correspond.
            </p>
          </div>
          <div className="max-w-4xl mx-auto">
            <div className="rounded-3xl border border-black/[0.06] bg-offwhite shadow-card-hover overflow-hidden">
              <div className="grid md:grid-cols-5">
                <div className="md:col-span-2 bg-gradient-to-br from-brand-600 to-brand-800 p-8 text-white">
                  <p className="text-sm text-brand-100 mb-2">Demande</p>
                  <p className="text-2xl font-bold mb-4">500 kg de maïs</p>
                  <div className="space-y-2 text-sm text-brand-100/90">
                    <p className="flex items-center gap-2"><MapPin className="h-4 w-4" /> Kinshasa</p>
                    <p className="flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Budget indiqué</p>
                    <p className="flex items-center gap-2"><PackageCheck className="h-4 w-4" /> Sous 14 jours</p>
                  </div>
                </div>
                <div className="md:col-span-3 p-6 space-y-3">
                  {[
                    { name: 'Producteur A', loc: 'Kinshasa', score: 92, color: 'text-emerald-600 bg-emerald-50' },
                    { name: 'Coopérative C', loc: 'Kikwit', score: 81, color: 'text-brand-600 bg-brand-50' },
                  ].map((r) => (
                    <div key={r.name} className="flex items-center justify-between rounded-xl border border-black/[0.06] p-4">
                      <div>
                        <p className="font-semibold text-charcoal">{r.name}</p>
                        <p className="text-sm text-charcoal/50">{r.loc}</p>
                      </div>
                      <div className={`flex flex-col items-center rounded-xl px-4 py-1.5 ${r.color}`}>
                        <span className="text-xl font-bold tabular-nums">{r.score}%</span>
                        <span className="text-[10px] uppercase tracking-wide">Match</span>
                      </div>
                    </div>
                  ))}
                  <div className="pt-2 space-y-1.5">
                    <p className="text-xs font-medium text-charcoal/50 uppercase tracking-wide">Critères de correspondance</p>
                    {['Produit compatible', 'Quantité disponible', 'Localisation proche', 'Disponibilité'].map((c) => (
                      <div key={c} className="flex items-center gap-2 text-sm text-charcoal/70">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" /> {c}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-4 text-center text-xs text-charcoal/40">
              Exemple illustratif (aucune donnée réelle). Le score de correspondance est indicatif : ce n'est pas une probabilité de vente.
            </p>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden py-24 sm:py-32">
        <div className="absolute inset-0">
          <img src={PAGE_IMAGES.about.url} alt={PAGE_IMAGES.about.alt} loading="lazy" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-br from-brand-950/90 via-brand-900/85 to-brand-800/80" />
        </div>
        <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <Quote className="h-10 w-10 text-brand-300 mx-auto mb-6" />
          <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight text-balance">
            Une meilleure connexion entre ceux qui produisent et ceux qui achètent.
          </h2>
          <p className="mt-6 text-lg text-brand-100/80 max-w-2xl mx-auto">
            Rejoignez AgriFlow RDC et participez à la transformation du commerce agricole congolais.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/register">
              <Button size="xl" className="group">
                Créer un compte
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
            <Link to="/marketplace">
              <Button size="xl" variant="outline" className="bg-white/10 text-white border-white/30 hover:bg-white/20">
                Explorer la marketplace
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
