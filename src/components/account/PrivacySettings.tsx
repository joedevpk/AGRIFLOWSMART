import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Cookie, Download, FileText, ShieldCheck, Trash2, TriangleAlert, UserRound } from 'lucide-react';
import { Card, CardBody, Button, Textarea } from '@/components/ui';
import { toast } from '@/components/ui/toast-store';
import { useAuth } from '@/contexts/auth-context';
import { ROLE_LABELS } from '@/lib/constants';
import { openConsentPreferences, useConsentState } from '@/lib/consent';
import { useModalA11y } from '@/hooks/useModalA11y';
import {
  buildDataExport, cancelAccountDeletion, countActiveOrders, downloadJson, getOpenDeletionRequest, requestAccountDeletion,
  type DeletionRequest,
} from '@/services/privacyService';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-charcoal/60 sm:w-40 sm:shrink-0">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-charcoal">{value || <span className="text-charcoal/50">Non renseigné</span>}</dd>
    </div>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: typeof UserRound; children: string }) {
  return <h3 className="flex items-center gap-2 text-base font-semibold text-charcoal"><Icon className="h-5 w-5 text-brand-600 dark:text-brand-300" aria-hidden="true" />{children}</h3>;
}

/** Confirmation explicite avant l'enregistrement d'une demande de suppression. */
function DeleteConfirmDialog({ activeOrders, onClose, onDone }: { activeOrders: number | null; onClose: () => void; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [understood, setUnderstood] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useModalA11y(true, busy ? () => undefined : onClose, ref, cancelRef);

  const submit = async () => {
    setBusy(true);
    const res = await requestAccountDeletion(reason);
    setBusy(false);
    if (!res.ok) { toast('error', res.message); if (res.code === 'ALREADY_REQUESTED') onDone(); return; }
    toast('success', 'Votre demande a été enregistrée. Aucune donnée n\'a été supprimée pour le moment.');
    onDone();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-brand-950/60" aria-hidden="true" onClick={busy ? undefined : onClose} />
      <div ref={ref} role="alertdialog" aria-modal="true" aria-labelledby="del-title" aria-describedby="del-desc" className="relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-offwhite p-5 shadow-lift sm:rounded-3xl sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700" aria-hidden="true"><TriangleAlert className="h-6 w-6" /></span>
          <div className="min-w-0">
            <h2 id="del-title" className="text-lg font-bold text-charcoal">Demander la suppression de mon compte</h2>
            <p id="del-desc" className="mt-2 text-sm leading-relaxed text-charcoal/80">La suppression de votre compte peut entraîner la perte de certaines données associées. Cette action doit être confirmée.</p>
          </div>
        </div>
        <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-charcoal/70 marker:text-brand-500">
          <li>Vous enregistrez une <strong>demande</strong> : rien n'est supprimé immédiatement.</li>
          <li>L'équipe vérifie d'abord les règles métier (commandes en cours, paiements) avant toute suppression.</li>
          <li>Les données rattachées à votre compte (profil, offres, messages, commandes…) peuvent être supprimées, ce qui peut aussi affecter vos partenaires de commande.</li>
          <li>Vous pouvez annuler votre demande tant qu'elle n'est pas en cours de traitement.</li>
        </ul>
        {activeOrders !== null && activeOrders > 0 && (
          <p role="note" className="mt-4 rounded-xl border border-accent-400 bg-accent-50 p-3 text-sm text-amber-900">Vous avez <strong>{activeOrders} commande{activeOrders > 1 ? 's' : ''} en cours</strong>. Elles seront prises en compte lors de l'examen de votre demande.</p>
        )}
        <div className="mt-4">
          <Textarea label="Motif (facultatif)" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Vous pouvez nous dire pourquoi, si vous le souhaitez." />
        </div>
        <label className="mt-4 flex min-h-[44px] cursor-pointer items-start gap-3 text-sm text-charcoal">
          <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 rounded border-charcoal/40 accent-brand-600" />
          <span>Je comprends que la suppression peut entraîner la perte de données associées à mon compte.</span>
        </label>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button ref={cancelRef} type="button" variant="outline" onClick={onClose} disabled={busy}>Annuler</Button>
          <Button type="button" variant="danger" onClick={() => void submit()} disabled={!understood} loading={busy}>Confirmer la demande</Button>
        </div>
      </div>
    </div>
  );
}

export function PrivacySettings() {
  const { user, profile } = useAuth();
  const { record } = useConsentState();
  const { hash } = useLocation();
  const [request, setRequest] = useState<DeletionRequest | null>(null);
  const [requestLoading, setRequestLoading] = useState(true);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [activeOrders, setActiveOrders] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const loadRequest = useCallback(async () => {
    if (!user) return;
    setRequestLoading(true);
    const res = await getOpenDeletionRequest(user.id);
    if (res.ok) { setRequest(res.data); setRequestError(null); } else setRequestError(res.message);
    setRequestLoading(false);
  }, [user]);

  useEffect(() => { void loadRequest(); }, [loadRequest]);

  const openConfirm = async () => {
    if (!user) return;
    setActiveOrders(null);
    setConfirmOpen(true);
    const res = await countActiveOrders(user.id);
    if (res.ok) setActiveOrders(res.data);
  };

  const exportData = async () => {
    if (!user) return;
    setExporting(true);
    const res = await buildDataExport(user.id, user.email, profile);
    setExporting(false);
    if (!res.ok) { toast('error', res.message); return; }
    try {
      await downloadJson(`agriflow-mes-donnees-${new Date().toISOString().slice(0, 10)}.json`, res.data);
    } catch {
      toast('error', 'Le fichier n\'a pas pu être enregistré sur cet appareil.');
      return;
    }
    toast('success', 'Votre copie est prête (téléchargée ou proposée au partage selon votre appareil).');
  };

  const cancelRequest = async () => {
    setCancelling(true);
    const res = await cancelAccountDeletion();
    setCancelling(false);
    if (!res.ok) { toast('error', res.message); void loadRequest(); return; }
    toast('success', 'Votre demande de suppression a été annulée.');
    void loadRequest();
  };

  const ready = Boolean(user && profile);
  useEffect(() => {
    if (ready && hash === '#confidentialite') document.getElementById('confidentialite')?.scrollIntoView();
  }, [ready, hash]);

  if (!user || !profile) return null;

  return (
    <section id="confidentialite" aria-labelledby="privacy-h" className="scroll-mt-24">
      <Card>
        <CardBody className="space-y-8">
          <div>
            <h2 id="privacy-h" className="flex items-center gap-2 text-xl font-bold text-charcoal"><ShieldCheck className="h-6 w-6 text-brand-600 dark:text-brand-300" aria-hidden="true" /> Mes données et ma confidentialité</h2>
            <p className="mt-1 text-sm text-charcoal/70">Consultez, exportez et contrôlez les données rattachées à votre compte. En savoir plus : <Link to="/confidentialite" className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-300">politique de confidentialité</Link>.</p>
          </div>

          <div>
            <SectionTitle icon={UserRound}>Informations de mon profil</SectionTitle>
            <dl className="mt-2 divide-y divide-black/[0.06]">
              <Row label="Nom complet" value={profile.full_name} />
              <Row label="Adresse e-mail" value={user.email} />
              <Row label="Téléphone" value={profile.phone} />
              <Row label="Province" value={profile.province} />
              <Row label="Ville" value={profile.city} />
              <Row label="Profil" value={ROLE_LABELS[profile.role] ?? profile.role} />
              <Row label="Compte créé le" value={fmtDate(profile.created_at)} />
            </dl>
            <p className="mt-2 text-xs text-charcoal/70">Votre nom, province, ville, présentation et photo sont visibles publiquement ; votre téléphone ne l'est pas. Pour modifier ces informations, utilisez le formulaire <a href="#profil-form" className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-300">« Mon profil »</a> ci-dessus.</p>
          </div>

          <div>
            <SectionTitle icon={Cookie}>Cookies et préférences</SectionTitle>
            <p className="mt-2 text-sm text-charcoal/70" role="status">
              {record
                ? <>Préférences d'affichage : <strong>{record.preferences ? 'mémorisées' : 'non mémorisées'}</strong> · Analytique : <strong>non utilisée</strong> · Choix du {fmtDate(record.decidedAt)}.</>
                : 'Vous n\'avez pas encore fait de choix : seuls les cookies nécessaires sont utilisés.'}
            </p>
            <p className="mt-1 text-xs text-charcoal/60">Ce choix est enregistré dans ce navigateur : il vaut pour cet appareil, pas pour votre compte.</p>
            <Button type="button" variant="outline" className="mt-3 w-full whitespace-normal sm:w-auto" onClick={openConsentPreferences}><Cookie className="h-4 w-4" aria-hidden="true" /> Gérer mes préférences de cookies</Button>
          </div>

          <div>
            <SectionTitle icon={FileText}>Copie de mes données</SectionTitle>
            <p className="mt-2 text-sm text-charcoal/70">Téléchargez un fichier JSON contenant votre profil, vos offres, demandes, commandes, paiements, messages, notifications, favoris, avis et parcelles. Il est généré dans votre navigateur ; jetons, secrets et liens de paiement en sont exclus.</p>
            <Button type="button" variant="outline" className="mt-3 w-full whitespace-normal sm:w-auto" loading={exporting} onClick={() => void exportData()}><Download className="h-4 w-4" aria-hidden="true" /> Télécharger mes données (JSON)</Button>
          </div>

          <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 dark:border-rose-400/30 dark:bg-rose-500/10 sm:p-5">
            <SectionTitle icon={Trash2}>Suppression du compte</SectionTitle>
            {requestLoading ? (
              <p className="mt-2 text-sm text-charcoal/60" role="status">Vérification de l'état de votre demande…</p>
            ) : request ? (
              <div className="mt-2 space-y-3">
                <p className="text-sm text-charcoal/80" role="status">Votre demande de suppression a été enregistrée le <strong>{fmtDate(request.created_at)}</strong> — statut : <strong>{request.status === 'processing' ? 'en cours de traitement' : 'en attente d\'examen'}</strong>. Aucune donnée n'a été supprimée à ce stade.</p>
                {request.status === 'requested'
                  ? <Button type="button" variant="outline" className="w-full whitespace-normal sm:w-auto" loading={cancelling} onClick={() => void cancelRequest()}>Annuler ma demande</Button>
                  : <p className="text-xs text-charcoal/60">La demande est en cours de traitement : elle ne peut plus être annulée ici. Contactez AgriFlow si nécessaire.</p>}
              </div>
            ) : (
              <div className="mt-2 space-y-3">
                <p className="text-sm text-charcoal/70">Vous pouvez demander la suppression de votre compte. La demande est examinée par l'équipe avant toute suppression : les commandes en cours et les règles métier sont vérifiées, et rien n'est supprimé automatiquement.</p>
                {requestError && <p className="text-sm text-rose-700" role="alert">{requestError}</p>}
                <Button type="button" variant="danger" className="w-full whitespace-normal sm:w-auto" onClick={() => void openConfirm()}><Trash2 className="h-4 w-4" aria-hidden="true" /> Demander la suppression de mon compte</Button>
              </div>
            )}
          </div>
        </CardBody>
      </Card>
      {confirmOpen && <DeleteConfirmDialog activeOrders={activeOrders} onClose={() => setConfirmOpen(false)} onDone={() => { setConfirmOpen(false); void loadRequest(); }} />}
    </section>
  );
}
