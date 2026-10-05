import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookOpen, Sprout, Lightbulb, WifiOff, ArrowRight, CalendarDays, CheckCircle2, Download, ListChecks, Search } from 'lucide-react';
import { Header, Footer } from '@/components/layout/Header';
import { Card, CardBody, Badge, Button, EmptyState, LoadingState } from '@/components/ui';
import { toast } from '@/components/ui/toast-store';
import { ConnectionBadge, SyncPill } from '@/components/agri/SyncStatus';
import { CROPS, GENERAL_TIPS, CROPS_SOURCE, STEP_KEYS, STEP_TITLES } from '@/lib/agri/crops';
import { cropProgress, useProgress } from '@/hooks/useProgress';
import { isOfflineReady, offlineSupported, prepareOffline } from '@/lib/offline/precache';
import { useConnection } from '@/contexts/sync-context';
import { cn } from '@/lib/utils';
import { useSeo } from '@/hooks/useSeo';
import { normalizeText } from '@/lib/agri-match';

type Tab = 'cultures' | 'apprendre' | 'parcours' | 'conseils' | 'offline';
const TABS: { id: Tab; label: string; icon: typeof BookOpen }[] = [
  { id: 'cultures', label: 'Découvrir les cultures', icon: Sprout },
  { id: 'apprendre', label: 'Apprendre à cultiver', icon: BookOpen },
  { id: 'parcours', label: 'Mes parcours', icon: ListChecks },
  { id: 'conseils', label: 'Conseils pratiques', icon: Lightbulb },
  { id: 'offline', label: 'Hors connexion', icon: WifiOff },
];

export function AgriGuidePage() {
  useSeo({
    title: 'AgriGuide : fiches pratiques de culture | AgriFlow RDC',
    description: 'Fiches simples pour mieux produire : cycle de culture, étapes, conseils pratiques et calendrier par zone, disponibles aussi hors connexion.',
  });
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'cultures') as Tab;

  return (
    <div className="min-h-screen bg-cream dark:bg-charcoal">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <Badge variant="brand">AgriGuide</Badge>
            <h1 className="mt-2 text-2xl font-bold text-charcoal sm:text-3xl">Apprendre, planifier, puis vendre</h1>
            <p className="mt-1 max-w-2xl text-sm text-charcoal/60">Des fiches simples pour mieux produire — et rejoindre directement les acheteurs quand votre récolte est prête.</p>
          </div>
          <div className="flex flex-wrap gap-2"><ConnectionBadge /><SyncPill /></div>
        </div>

        <div role="tablist" aria-label="Sections AgriGuide" className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          {TABS.map((t) => (
            <button
              key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setParams({ tab: t.id })}
              className={cn('inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border px-4 text-sm font-medium transition-colors',
                tab === t.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-black/[0.08] bg-offwhite text-charcoal/70 hover:bg-brand-50')}
            >
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>

        <div role="tabpanel">
        {tab === 'cultures' && <CropsTab />}
        {tab === 'apprendre' && <LearnTab />}
        {tab === 'parcours' && <JourneysTab />}
        {tab === 'conseils' && <TipsTab />}
        {tab === 'offline' && <OfflineTab />}
        </div>

        <p className="mt-10 rounded-xl border border-black/[0.06] bg-offwhite p-4 text-xs text-charcoal/55">
          <strong>Source des données :</strong> {CROPS_SOURCE} Les fiches donnent des repères généraux et non une recommandation personnalisée.
        </p>
      </main>
      <Footer />
    </div>
  );
}

function CropsTab() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');
  const categories = useMemo(() => Array.from(new Set(CROPS.map((c) => c.category))), []);
  const visible = useMemo(() => {
    const q = normalizeText(query);
    return CROPS.filter((c) => (category === 'all' || c.category === category) && (!q || normalizeText(`${c.name} ${c.summary} ${c.category}`).includes(q)));
  }, [query, category]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal/40" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une culture"
            aria-label="Rechercher une culture"
            className="h-12 w-full rounded-xl border border-black/[0.08] bg-offwhite pl-10 pr-4 text-sm text-charcoal placeholder:text-charcoal/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-white/10"
          />
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="group" aria-label="Filtrer par catégorie">
          {['all', ...categories].map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={cn('inline-flex min-h-[44px] shrink-0 items-center rounded-full border px-4 text-sm font-medium capitalize transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500', category === c ? 'border-brand-600 bg-brand-600 text-white' : 'border-black/[0.08] bg-offwhite text-charcoal/70 hover:bg-brand-50 dark:border-white/10')}
            >
              {c === 'all' ? 'Toutes' : c}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <Card><CardBody><EmptyState icon={<Search className="h-8 w-8" />} title="Aucune culture trouvée" description="Essayez un autre mot-clé ou une autre catégorie." action={<Button variant="outline" onClick={() => { setQuery(''); setCategory('all'); }}>Réinitialiser</Button>} /></CardBody></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((c) => (
            <Link key={c.id} to={`/agriguide/${c.id}`} className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
              <Card hover className="h-full">
                <CardBody className="flex h-full flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sage text-brand-800" aria-hidden="true"><Sprout className="h-6 w-6" /></span>
                    <div><h2 className="font-semibold text-charcoal">{c.name}</h2><Badge variant="neutral">{c.category}</Badge></div>
                  </div>
                  <p className="flex-1 text-sm text-charcoal/60">{c.summary}</p>
                  <p className="text-xs text-charcoal/50">Cycle : {c.cycleLabel}</p>
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-brand-700">Ouvrir la fiche <ArrowRight className="h-4 w-4" aria-hidden="true" /></span>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function LearnTab() {
  return (
    <div className="space-y-6">
      <Card><CardBody>
        <h2 className="text-lg font-semibold text-charcoal">Le même chemin pour chaque culture</h2>
        <ol className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {STEP_KEYS.map((k, i) => (
            <li key={k} className="flex items-center gap-3 rounded-xl bg-sage/50 px-3 py-2.5 text-sm text-charcoal">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{i + 1}</span>{STEP_TITLES[k]}
            </li>
          ))}
        </ol>
      </CardBody></Card>
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-charcoal/50">Choisissez une culture pour commencer</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {CROPS.map((c) => (
            <Link key={c.id} to={`/agriguide/${c.id}`} className="flex h-full flex-col items-center gap-1.5 rounded-2xl border border-black/[0.06] bg-offwhite p-4 text-center text-sm font-medium text-charcoal transition-colors hover:border-brand-300 hover:bg-brand-50">
              <span className="text-2xl" aria-hidden>{c.emoji}</span>{c.name}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function JourneysTab() {
  const { map, loading, fromCache, isAuthed } = useProgress();
  if (!isAuthed) {
    return <Card><CardBody><EmptyState icon={<ListChecks className="h-8 w-8" />} title="Connectez-vous pour suivre votre progression" description="Votre avancement par culture est enregistré sur votre compte, et sur cet appareil quand vous êtes hors connexion." action={<Link to="/login"><Button>Se connecter</Button></Link>} /></CardBody></Card>;
  }
  if (loading) return <LoadingState />;
  const started = CROPS.map((c) => ({ c, p: cropProgress(map, c.id) })).filter((x) => x.p.done > 0);
  return (
    <div className="space-y-4">
      {fromCache && <p className="text-xs text-charcoal/50">Affichage des dernières données enregistrées sur cet appareil.</p>}
      {started.length === 0 ? (
        <Card><CardBody><EmptyState icon={<ListChecks className="h-8 w-8" />} title="Aucun parcours commencé" description="Ouvrez une fiche culture et cochez les étapes au fur et à mesure." action={<Link to="/agriguide?tab=cultures"><Button>Découvrir les cultures</Button></Link>} /></CardBody></Card>
      ) : started.map(({ c, p }) => (
        <Link key={c.id} to={`/agriguide/${c.id}`} className="block">
          <Card hover><CardBody>
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold text-charcoal"><span aria-hidden>{c.emoji}</span> Mon parcours — {c.name}</h3>
              <span className="text-sm font-bold text-brand-700">{p.pct} %</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-sage" role="progressbar" aria-valuenow={p.pct} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-brand-600" style={{ width: `${p.pct}%` }} /></div>
            <p className="mt-2 text-xs text-charcoal/55">{p.nextIndex === -1 ? 'Parcours terminé — pensez à publier votre production.' : `Prochaine étape : ${STEP_TITLES[STEP_KEYS[p.nextIndex]]}`}</p>
          </CardBody></Card>
        </Link>
      ))}
    </div>
  );
}

function TipsTab() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {GENERAL_TIPS.map((t) => (
        <Card key={t.title}><CardBody><h3 className="flex items-center gap-2 font-semibold text-charcoal"><Lightbulb className="h-4 w-4 text-accent-600" /> {t.title}</h3><p className="mt-2 text-sm text-charcoal/60">{t.text}</p></CardBody></Card>
      ))}
    </div>
  );
}

function OfflineTab() {
  const connection = useConnection();
  const [ready, setReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const supported = offlineSupported();
  useEffect(() => { void isOfflineReady().then(setReady); }, []);

  const prepare = async () => {
    setBusy(true);
    const r = await prepareOffline();
    setBusy(false);
    if (r.ok) { toast('success', 'Guides et calendrier préparés pour une utilisation hors connexion.'); setReady(await isOfflineReady()); }
    else toast('error', r.reason ?? 'Préparation impossible pour le moment.');
  };

  return (
    <div className="space-y-4">
      <Card><CardBody className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-charcoal"><WifiOff className="h-5 w-5 text-brand-700" /> Ressources hors connexion</h2>
        <p className="text-sm text-charcoal/60">Préparez l'application tant que vous avez du réseau : les fiches AgriGuide et le calendrier resteront consultables ensuite, même sans connexion.</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void prepare()} disabled={!supported || busy || connection === 'offline'}><Download className="h-4 w-4" /> {busy ? 'Préparation…' : 'Préparer le mode hors connexion'}</Button>
          {ready === true && <Badge variant="success" dot>Prêt hors connexion</Badge>}
          {ready === false && supported && <Badge variant="neutral">Pas encore préparé</Badge>}
          {!supported && <Badge variant="warning">Non pris en charge par ce navigateur</Badge>}
        </div>
        {!import.meta.env.PROD && <p className="text-xs text-charcoal/45">Le service worker n'est actif que sur la version publiée (build de production).</p>}
      </CardBody></Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardBody>
          <h3 className="mb-2 font-semibold text-charcoal">Disponible hors connexion</h3>
          <ul className="space-y-1.5 text-sm text-charcoal/70">
            {['Fiches AgriGuide et parcours', 'Calendrier agricole', 'Analyse d\'aptitude (calcul sur l\'appareil)', 'Parcelles et notes déjà consultées', 'Brouillon de publication (texte)', 'Cochage des étapes et notes : enregistrés puis synchronisés'].map((x) => (
              <li key={x} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {x}</li>
            ))}
          </ul>
        </CardBody></Card>
        <Card><CardBody>
          <h3 className="mb-2 font-semibold text-charcoal">Nécessite une connexion</h3>
          <ul className="space-y-1.5 text-sm text-charcoal/70">
            {['Marketplace et produits', 'Commande et paiement', 'Confirmation de stock', 'Publication effective d\'une offre', 'Agri-Match et messages'].map((x) => (
              <li key={x} className="flex gap-2"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-charcoal/40" /> {x}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-charcoal/50">Aucune commande ni aucun paiement n'est jamais validé hors connexion.</p>
        </CardBody></Card>
      </div>
    </div>
  );
}
