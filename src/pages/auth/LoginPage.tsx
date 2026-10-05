import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Input, Button } from '@/components/ui';
import { toast } from '@/components/ui/toast-store';
import { useAuth } from '@/contexts/auth-context';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await signIn(email, password);
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    toast('success', 'Connexion réussie. Bienvenue sur AgriFlow.');
    // Retour à la page d'origine (ex. fiche produit) si l'utilisateur a été redirigé ici.
    const from = (location.state as { from?: string } | null)?.from;
    navigate(from && from.startsWith('/') && !from.startsWith('//') ? from : '/dashboard');
  };

  return (
    <AuthLayout title="Connexion" subtitle="Accédez à votre compte AgriFlow RDC.">
      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          label="Adresse email"
          type="email"
          placeholder="vous@exemple.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <div className="relative">
          <Input
            label="Mot de passe"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}
        <Button type="submit" fullWidth size="lg" loading={loading}>
          Se connecter
        </Button>
        <div className="flex items-center justify-between text-sm">
          <Link to="/forgot-password" className="text-brand-600 hover:text-brand-700 font-medium">
            Mot de passe oublié ?
          </Link>
          <Link to="/register" className="text-brand-600 hover:text-brand-700 font-medium">
            Créer un compte
          </Link>
        </div>
        <div className="rounded-xl bg-brand-50 border border-brand-200 px-4 py-3 text-sm text-brand-700">
          <p className="font-medium mb-1">Comptes de démonstration</p>
          <p className="text-xs text-brand-600">Créez un compte producteur ou acheteur pour tester la plateforme.</p>
        </div>
      </form>
    </AuthLayout>
  );
}
