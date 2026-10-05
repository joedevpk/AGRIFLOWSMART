import { BUYER_REQUEST_COLUMNS } from '@/lib/columns';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Inbox, MapPin, TrendingUp, Package, Sparkles } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardBody, Badge, Button, Input, Select, Textarea, EmptyState, LoadingState } from '@/components/ui';
import { toast } from '@/components/ui/toast-store';
import { useAuth } from '@/contexts/auth-context';
import { supabase } from '@/lib/supabase';
import type { BuyerRequest, RequestStatus } from '@/types';
import { CATEGORIES, PROVINCES, UNITS, UNIT_LABELS, formatQuantity, formatPrice, formatDate, REQUEST_STATUS_LABELS, PRODUCTS_CATALOG } from '@/lib/constants';

export function BuyerRequestsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<BuyerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ productName: '', category: '', quantity: '', unit: 'kg', budget: '', province: '', city: '', desiredDate: '', description: '' });

  const load = useCallback(() => {
    if (!user) return;
    supabase.from('buyer_requests').select(BUYER_REQUEST_COLUMNS).eq('user_id', user.id).order('created_at', { ascending: false }).then(({ data }) => {
      setRequests((data as BuyerRequest[]) ?? []);
      setLoading(false);
    });
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.productName.trim() || !form.quantity) { toast('error', 'Indiquez le produit recherché et la quantité.'); return; }
    if (!(Number(form.quantity) > 0)) { toast('error', 'La quantité doit être supérieure à zéro.'); return; }
    setSubmitting(true);
    const { error } = await supabase.from('buyer_requests').insert({
      user_id: user.id,
      product_name: form.productName.trim(),
      category: form.category || null,
      quantity: Number(form.quantity),
      unit: form.unit,
      budget: form.budget ? Number(form.budget) : null,
      currency: 'USD',
      province: form.province || null,
      city: form.city || null,
      desired_date: form.desiredDate || null,
      description: form.description || null,
      status: 'open',
    });
    setSubmitting(false);
    if (error) { toast('error', 'Votre demande n\'a pas pu être publiée. Réessayez.'); return; }
    toast('success', 'Votre demande a été publiée. Les producteurs peuvent maintenant la voir.');
    setShowForm(false);
    setForm({ productName: '', category: '', quantity: '', unit: 'kg', budget: '', province: '', city: '', desiredDate: '', description: '' });
    load();
  };

  const closeRequest = async (req: BuyerRequest, status: RequestStatus) => {
    const { error } = await supabase.from('buyer_requests').update({ status }).eq('id', req.id).eq('user_id', req.user_id);
    if (error) { toast('error', 'La demande n\'a pas pu être mise à jour. Réessayez.'); return; }
    toast('success', status === 'fulfilled' ? 'Demande marquée comme satisfaite.' : 'Demande clôturée.');
    load();
  };

  if (loading) return <DashboardLayout title="Mes demandes"><LoadingState /></DashboardLayout>;

  return (
    <DashboardLayout title="Mes demandes d'achat">
      <div className="space-y-6">
        <div className="flex justify-end">
          <Button onClick={() => setShowForm(!showForm)}><Plus className="h-4 w-4" /> {showForm ? 'Annuler' : 'Créer une demande'}</Button>
        </div>

        {showForm && (
          <Card><CardBody>
            <form onSubmit={handleSubmit} className="space-y-5">
              <h3 className="text-lg font-semibold text-charcoal">Nouvelle demande d'achat</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-charcoal/80 mb-1.5">Produit recherché</label>
                  <input list="products-list" value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} className="w-full rounded-xl border border-brand-200 px-4 py-2.5 text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10" placeholder="Maïs, Tomate..." />
                  <datalist id="products-list">{PRODUCTS_CATALOG.map((p) => <option key={p.name} value={p.name} />)}</datalist>
                </div>
                <Select label="Catégorie (optionnel)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Sélectionner" options={CATEGORIES.map((c) => ({ value: c.id, label: c.label }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Quantité" type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder="500" />
                <Select label="Unité" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} options={UNITS.map((u) => ({ value: u, label: UNIT_LABELS[u] || u }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Budget (USD, optionnel)" type="number" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} placeholder="1000" />
                <Input label="Date souhaitée" type="date" value={form.desiredDate} onChange={(e) => setForm({ ...form, desiredDate: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Select label="Province (optionnel)" value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} placeholder="Sélectionner" options={PROVINCES.map((p) => ({ value: p, label: p }))} />
                <Input label="Ville (optionnel)" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Kinshasa" />
              </div>
              <Textarea label="Description (optionnel)" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ex : Je recherche 5 tonnes de maïs pour livraison à Kinshasa." />
              <Button type="submit" fullWidth loading={submitting}>Publier la demande</Button>
            </form>
          </CardBody></Card>
        )}

        {requests.length === 0 ? (
          <Card><CardBody><EmptyState icon={<Inbox className="h-8 w-8" />} title="Aucune demande" description="Créez une demande d'achat pour que les producteurs puissent vous trouver." action={<Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> Créer une demande</Button>} /></CardBody></Card>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => (
              <Card key={req.id} hover>
                <CardBody>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-charcoal">{req.product_name}</h3>
                        <Badge variant={req.status === 'open' ? 'success' : 'neutral'} dot>{REQUEST_STATUS_LABELS[req.status]}</Badge>
                      </div>
                      <p className="text-sm text-charcoal/60">{formatQuantity(req.quantity, req.unit)}</p>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-charcoal/60">
                        {req.city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {req.city}</span>}
                        {req.budget && <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" /> {formatPrice(req.budget, req.currency)}</span>}
                        <span className="flex items-center gap-1"><Package className="h-3 w-3" /> {formatDate(req.desired_date)}</span>
                      </div>
                      {req.description && <p className="mt-2 text-sm text-charcoal/70">{req.description}</p>}
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      {req.status === 'open' && <Button size="sm" onClick={() => navigate(`/agrimatch/${req.id}`)}><Sparkles className="h-3.5 w-3.5" /> Agri-Match</Button>}
                      <Button variant="outline" size="sm" onClick={() => navigate(`/marketplace?q=${encodeURIComponent(req.product_name)}`)}>Voir les offres</Button>
                      {req.status === 'open' && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => void closeRequest(req, 'fulfilled')}>Marquer satisfaite</Button>
                          <Button variant="ghost" size="sm" onClick={() => void closeRequest(req, 'closed')}>Clôturer</Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
