import { useEffect, useState, useCallback, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile, UserRole, BuyerType } from '@/types';
import { AuthContext } from './auth-context';

// Le profil est créé automatiquement côté serveur (trigger handle_new_user sur
// auth.users). Le client ne demande donc que les champs non sensibles ; le
// téléphone (colonne restreinte par RLS/column privileges) est récupéré à part
// via la fonction get_profile_phone, qui n'autorise que le propriétaire, un
// admin, ou un participant à une commande partagée à le lire.
const PROFILE_COLUMNS = 'id, user_id, role, buyer_type, full_name, province, city, bio, avatar_url, is_verified, is_available_for_orders, availability_until, created_at, updated_at';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      console.error('Error loading profile:', error);
      return;
    }
    if (!data) {
      // Le trigger handle_new_user crée normalement le profil de façon
      // synchrone à l'inscription ; s'il est absent (compte créé avant cette
      // migration, ou incident), on ne bloque pas l'utilisateur mais on ne
      // fabrique pas non plus de profil fictif côté client.
      setProfile(null);
      return;
    }
    const { data: phone } = await supabase.rpc('get_profile_phone', { p_user_id: userId });
    setProfile({ ...(data as Profile), phone: phone ?? null });
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user.id);
  }, [user, loadProfile]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        loadProfile(data.session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        (async () => {
          await loadProfile(newSession.user.id);
        })();
      } else {
        setProfile(null);
      }
    });

    return () => authListener.subscription.unsubscribe();
  }, [loadProfile]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    role: UserRole,
    buyerType?: BuyerType,
    extra?: { phone?: string; province?: string; city?: string },
  ) => {
    // L'inscription publique ne peut jamais créer un compte admin ; même si
    // ce cas ne devrait pas se produire côté UI, on bloque ici aussi, et le
    // serveur (trigger + contrainte) refuserait de toute façon.
    if (role === 'admin') {
      return { error: 'Rôle invalide.' };
    }
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role,
          buyer_type: buyerType ?? null,
          phone: extra?.phone ?? null,
          province: extra?.province ?? null,
          city: extra?.city ?? null,
        },
      },
    });
    if (error) return { error: error.message };
    // Le profil est créé côté serveur par le trigger handle_new_user ; rien à
    // faire de plus ici (évite l'état "authentifié mais sans profil" en cas
    // d'échec réseau entre deux appels côté client).
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
