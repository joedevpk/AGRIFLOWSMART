import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package, MapPin, BadgeCheck } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardBody, Badge, Avatar, EmptyState, LoadingState } from '@/components/ui';
import { useAuth } from '@/contexts/auth-context';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types';
import { ROLE_LABELS } from '@/lib/constants';

export function BuyerSuppliersPage() {
  const { user } = useAuth();
  const [suppliers, setSuppliers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, user_id, role, buyer_type, full_name, province, city, bio, avatar_url, is_verified, created_at, updated_at')
      .in('role', ['producer', 'cooperative'])
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => { setSuppliers((data as Profile[]) ?? []); setLoading(false); });
  }, [user]);

  if (loading) return <DashboardLayout title="Fournisseurs"><LoadingState /></DashboardLayout>;

  return (
    <DashboardLayout title="Fournisseurs">
      <div className="space-y-4">
        {suppliers.length === 0 ? (
          <Card><CardBody><EmptyState icon={<Package className="h-8 w-8" />} title="Aucun fournisseur" description="Les producteurs inscrits apparaîtront ici." /></CardBody></Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {suppliers.map((s) => (
              <Link key={s.id} to={`/producer/${s.user_id}`}>
                <Card hover className="h-full">
                  <CardBody>
                    <div className="flex items-start gap-4">
                      <Avatar name={s.full_name} src={s.avatar_url} size="lg" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-charcoal truncate">{s.full_name}</h3>
                          {s.is_verified && <BadgeCheck className="h-4.5 w-4.5 text-brand-500 shrink-0" />}
                        </div>
                        <Badge variant="neutral" className="mt-1">{ROLE_LABELS[s.role]}</Badge>
                        {s.city && <p className="mt-2 flex items-center gap-1 text-sm text-charcoal/60"><MapPin className="h-3.5 w-3.5" /> {s.city}{s.province ? `, ${s.province}` : ''}</p>}
                        {s.bio && <p className="mt-2 text-sm text-charcoal/60 line-clamp-2">{s.bio}</p>}
                      </div>
                    </div>
                  </CardBody>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
