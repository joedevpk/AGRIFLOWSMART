import { useRef, useState } from 'react';
import { CheckCircle2, PauseCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/toast-store';
import { useAuth } from '@/contexts/auth-context';
import { useLanguage } from '@/contexts/language-context';
import { setMyAvailability } from '@/services/availabilityService';
import { formatDeadline, isProducerAccepting, unavailableUntil } from '@/lib/order-confirmation';
import { cn } from '@/lib/utils';

function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Paramètre « Disponibilité des commandes » du producteur. Désactiver ne bloque QUE les nouvelles commandes :
 * les commandes déjà reçues restent à traiter. Le serveur (RPC `set_my_availability` + trigger sur orders)
 * fait foi ; ce composant n'est que l'interface.
 */
export function ProducerAvailabilityCard({ className }: { className?: string }) {
  const { profile, refreshProfile } = useAuth();
  const { t, language } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState('');
  const lock = useRef(false);

  if (!profile || (profile.role !== 'producer' && profile.role !== 'cooperative')) return null;

  const accepting = isProducerAccepting(profile);
  const until = unavailableUntil(profile);

  const save = async (available: boolean, untilDate: Date | null) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    const result = await setMyAvailability(available, untilDate);
    if (result.ok) { toast('success', t('availability.saved')); await refreshProfile(); }
    else toast('error', t(result.message));
    lock.current = false;
    setBusy(false);
  };

  const saveDate = () => {
    if (!date) return void save(false, null);
    const [y, m, d] = date.split('-').map(Number);
    void save(false, new Date(y, m - 1, d, 0, 0, 0));
  };

  return (
    <section aria-labelledby="availability-title" className={cn('rounded-2xl border border-black/[0.06] bg-offwhite p-5 shadow-card dark:border-white/10 dark:bg-white/[0.04]', className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="availability-title" className="text-base font-bold text-charcoal">{t('availability.title')}</h2>
          <p className="mt-1 text-sm text-charcoal/70">{t('availability.toggle')}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={accepting}
          aria-labelledby="availability-title"
          disabled={busy}
          onClick={() => void save(!accepting, null)}
          className={cn(
            'relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-60',
            accepting ? 'border-brand-600 bg-brand-600' : 'border-slate-400 bg-slate-300',
          )}
        >
          <span className={cn('inline-block h-6 w-6 rounded-full bg-white shadow transition-transform', accepting ? 'translate-x-7' : 'translate-x-1')} />
          <span className="sr-only">{accepting ? t('producer.available') : t('producer.unavailable')}</span>
        </button>
      </div>

      <p className={cn('mt-3 flex items-start gap-2 text-sm font-medium', accepting ? 'text-emerald-800 dark:text-emerald-200' : 'text-slate-700 dark:text-slate-200')} role="status">
        {accepting ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <PauseCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
        <span>{accepting ? t('availability.onNote') : until ? t('availability.offUntilNote', { date: formatDeadline(until, language) }) : t('availability.offNote')}</span>
      </p>
      <p className="mt-1 text-xs text-charcoal/60">{t('availability.existing')}</p>

      {!accepting && (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-charcoal">
            {t('availability.until')}
            <input
              type="date"
              min={tomorrowISO()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 block min-h-[44px] w-full rounded-xl border border-black/15 bg-white px-3 text-sm text-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            />
          </label>
          <Button size="sm" variant="outline" loading={busy} onClick={saveDate}>{t('availability.save')}</Button>
          <p className="basis-full text-xs text-charcoal/60">{t('availability.untilHint')}</p>
        </div>
      )}
    </section>
  );
}

/** Bandeau très visible en tête du tableau de bord quand le producteur est indisponible. */
export function UnavailableBanner() {
  const { profile, refreshProfile } = useAuth();
  const { t, language } = useLanguage();
  const [busy, setBusy] = useState(false);
  if (!profile || (profile.role !== 'producer' && profile.role !== 'cooperative') || isProducerAccepting(profile)) return null;
  const until = unavailableUntil(profile);

  const reactivate = async () => {
    setBusy(true);
    const result = await setMyAvailability(true, null);
    if (result.ok) { toast('success', t('availability.saved')); await refreshProfile(); }
    else toast('error', t(result.message));
    setBusy(false);
  };

  return (
    <div role="status" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-300 bg-slate-100 p-4 text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
      <div className="flex min-w-0 items-start gap-3">
        <PauseCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">{t('availability.bannerTitle')}</p>
          <p className="text-sm">{until ? t('availability.offUntilNote', { date: formatDeadline(until, language) }) : t('availability.offNote')}</p>
        </div>
      </div>
      <Button size="sm" loading={busy} onClick={() => void reactivate()}>{t('availability.reactivate')}</Button>
    </div>
  );
}
