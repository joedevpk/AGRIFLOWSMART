import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sprout, Building2, ShoppingBag, Check } from 'lucide-react';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Input, Select, Button } from '@/components/ui';
import { toast } from '@/components/ui/toast-store';
import { useAuth } from '@/contexts/auth-context';
import type { UserRole, BuyerType } from '@/types';
import { PROVINCES, BUYER_TYPE_LABELS } from '@/lib/constants';
import { cn } from '@/lib/utils';

export function RegisterPage() {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [step, setStep] = useState(1);
  const [role, setRole] = useState<UserRole | null>(null);
  const [buyerType, setBuyerType] = useState<BuyerType | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roles: { id: UserRole; label: string; icon: React.ReactNode; desc: string }[] = [
    { id: 'producer', label: 'Producteur', icon: <Sprout className="h-6 w-6" />, desc: 'Je vends ma production agricole' },
    { id: 'cooperative', label: 'Coopérative', icon: <Building2 className="h-6 w-6" />, desc: 'Nous vendons la production de nos membres' },
    { id: 'buyer', label: 'Acheteur', icon: <ShoppingBag className="h-6 w-6" />, desc: 'Je recherche des produits agricoles' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!role) return;
    setLoading(true);
    const { error: err } = await signUp(email, password, fullName, role, buyerType ?? undefined, { phone, province, city });
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    toast('success', 'Compte créé avec succès. Bienvenue sur AgriFlow.');
    navigate('/dashboard');
  };

  return (
    <AuthLayout title="Créer un compte" subtitle="Rejoignez la plateforme agritech AgriFlow RDC.">
      {step === 1 && (
        <div className="space-y-5">
          <div>
            <p className="text-sm font-medium text-charcoal/80 mb-3">Je suis :</p>
            <div className="space-y-3">
              {roles.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setRole(r.id)}
                  className={cn(
                    'flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-all',
                    role === r.id
                      ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/20'
                      : 'border-brand-200 hover:border-brand-300 hover:bg-cream',
                  )}
                >
                  <div className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-xl transition-colors',
                    role === r.id ? 'bg-brand-500 text-white' : 'bg-cream text-charcoal/50',
                  )}>
                    {r.icon}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-charcoal">{r.label}</p>
                    <p className="text-sm text-charcoal/60">{r.desc}</p>
                  </div>
                  {role === r.id && <Check className="h-5 w-5 text-brand-600" />}
                </button>
              ))}
            </div>
          </div>
          {role === 'buyer' && (
            <div>
              <p className="text-sm font-medium text-charcoal/80 mb-3">Type d'acheteur :</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(BUYER_TYPE_LABELS).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setBuyerType(id as BuyerType)}
                    className={cn(
                      'rounded-xl border px-3 py-2.5 text-sm font-medium transition-all',
                      buyerType === id
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-brand-200 text-charcoal/70 hover:border-brand-300',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Button
            fullWidth
            size="lg"
            onClick={() => setStep(2)}
            disabled={!role || (role === 'buyer' && !buyerType)}
          >
            Continuer
          </Button>
          <p className="text-center text-sm text-charcoal/60">
            Déjà un compte ? <a href="/login" className="text-brand-600 hover:text-brand-700 font-medium">Se connecter</a>
          </p>
        </div>
      )}

      {step === 2 && (
        <form onSubmit={handleSubmit} className="space-y-5">
          <Input label="Nom complet" placeholder="Jean Mukendi" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          <Input label="Adresse email" type="email" placeholder="vous@exemple.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input label="Mot de passe" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Téléphone" placeholder="+243 ..." value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Select
              label="Province"
              placeholder="Sélectionner"
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              options={PROVINCES.map((p) => ({ value: p, label: p }))}
            />
          </div>
          <Input label="Ville" placeholder="Kinshasa" value={city} onChange={(e) => setCity(e.target.value)} />
          {error && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}
          <div className="flex gap-3">
            <Button type="button" variant="outline" size="lg" onClick={() => setStep(1)}>Retour</Button>
            <Button type="submit" size="lg" fullWidth loading={loading}>Créer mon compte</Button>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
