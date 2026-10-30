import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button, Input } from '@/components/ui';
import { toast } from '@/components/ui/toast-store';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/logger';

const MIN_LENGTH = 8;
type Phase = 'checking' | 'ready' | 'invalid';

/**
 * Définition du nouveau mot de passe après un lien de réinitialisation.
 * Avant cette page, le lien envoyé par e-mail ouvrait /login avec une session de récupération et AUCUN écran ne permettait de
 * saisir un nouveau mot de passe : la récupération n'aboutissait jamais. La page est publique : l'accès repose sur la session de
 * récupération créée par Supabase à partir du lien (jeton à usage limité), pas sur l'URL.
 */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    // getSession attend la fin de l'initialisation du client, donc le traitement du lien (jeton dans l'URL).
    void supabase.auth.getSession().then(({ data }) => { if (alive) setPhase(data.session ? 'ready' : 'invalid'); });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (alive && event === 'PASSWORD_RECOVERY' && session) setPhase('ready');
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (password.length < MIN_LENGTH) { setError(`Le mot de passe doit contenir au moins ${MIN_LENGTH} caractères.`); return; }
    if (password !== confirm) { setError('Les deux mots de passe ne sont pas identiques.'); return; }
    setError(undefined);
    setSaving(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setSaving(false);
      reportError('ResetPasswordPage.submit', err.message, { fn: 'updateUser' });
      const same = /different|same/i.test(err.message);
      toast('error', same ? 'Choisissez un mot de passe différent de l\'ancien.' : 'Le mot de passe n\'a pas pu être modifié. Le lien a peut-être expiré : demandez-en un nouveau.');
      return;
    }
    await supabase.auth.signOut(); // connexion explicite avec le nouveau mot de passe
    toast('success', 'Mot de passe modifié. Connectez-vous avec votre nouveau mot de passe.');
    navigate('/login', { replace: true });
  };

  return (
    <AuthLayout title="Nouveau mot de passe" subtitle="Choisissez un nouveau mot de passe pour votre compte.">
      {phase === 'checking' && <p role="status" className="text-center text-sm text-charcoal/60">Vérification du lien…</p>}
      {phase === 'invalid' && (
        <div className="space-y-5">
          <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
            Ce lien est invalide ou a expiré. Demandez un nouveau lien de réinitialisation.
          </p>
          <Link to="/forgot-password"><Button fullWidth size="lg">Demander un nouveau lien</Button></Link>
        </div>
      )}
      {phase === 'ready' && (
        <form onSubmit={(e) => void submit(e)} className="space-y-5" noValidate>
          <Input label="Nouveau mot de passe" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} hint={`${MIN_LENGTH} caractères minimum.`} required />
          <Input label="Confirmer le mot de passe" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={error} required />
          <Button type="submit" fullWidth size="lg" loading={saving} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer le mot de passe'}</Button>
        </form>
      )}
    </AuthLayout>
  );
}
