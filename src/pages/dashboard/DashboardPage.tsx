import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { LoadingState } from '@/components/ui';
import { useAuth } from '@/contexts/auth-context';
import { ProducerDashboard } from '@/components/dashboard/ProducerDashboard';
import { BuyerDashboard } from '@/components/dashboard/BuyerDashboard';
import { useSeo } from '@/hooks/useSeo';

/**
 * Tableau de bord — un composant par rôle :
 *  - producteur / coopérative : « Comment vendre ma production directement ? »
 *  - acheteur : « Comment trouver et acheter directement auprès des producteurs ? »
 * Tous les chiffres viennent de la base ; les paiements de démonstration ne comptent jamais comme revenus.
 */
export function DashboardPage() {
  const { profile } = useAuth();
  useSeo({ title: 'Tableau de bord | AgriFlow RDC', noindex: true });
  if (!profile) return <DashboardLayout><LoadingState /></DashboardLayout>;
  return (
    <DashboardLayout title="Tableau de bord">
      {profile.role === 'buyer' ? <BuyerDashboard /> : <ProducerDashboard />}
    </DashboardLayout>
  );
}
