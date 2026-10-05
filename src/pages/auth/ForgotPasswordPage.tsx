import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Input, Button } from '@/components/ui';
import { toast } from '@/components/ui/toast-store';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/logger';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  // Avant la passe 24, cette page affichait « email envoyé » SANS jamais contacter Supabase (aucun e-mail ne partait).
  // Elle appelle maintenant réellement Supabase Auth. Le message reste volontairement neutre (pas de fuite d'existence de compte).
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/login` });
    setSending(false);
    if (error) {
      reportError('ForgotPasswordPage.submit', error.message, { fn: 'resetPasswordForEmail' });
      // Limite d'envoi, réseau, service e-mail non configuré : l'utilisateur doit savoir que rien n'est parti.
      toast('error', 'Impossible d\'envoyer l\'e-mail pour le moment. Réessayez dans quelques minutes.');
      return;
    }
    setSent(true);
    toast('info', 'Si cette adresse existe, un e-mail de réinitialisation a été envoyé.');
  };

  return (
    <AuthLayout title="Mot de passe oublié" subtitle="Saisissez votre email pour réinitialiser votre mot de passe.">
      {sent ? (
        <div className="space-y-6">
          <div className="rounded-xl bg-brand-50 border border-brand-200 px-4 py-4 text-sm text-brand-700">
            Un email de réinitialisation a été envoyé à <strong>{email}</strong> si ce compte existe.
          </div>
          <Link to="/login">
            <Button fullWidth size="lg" variant="outline">
              <ArrowLeft className="h-4 w-4" /> Retour à la connexion
            </Button>
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            label="Adresse email"
            type="email"
            placeholder="vous@exemple.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Button type="submit" fullWidth size="lg" loading={sending} disabled={sending}>{sending ? 'Envoi en cours…' : 'Envoyer le lien'}</Button>
          <Link to="/login" className="block text-center text-sm text-brand-600 hover:text-brand-700 font-medium">
            Retour à la connexion
          </Link>
        </form>
      )}
    </AuthLayout>
  );
}
