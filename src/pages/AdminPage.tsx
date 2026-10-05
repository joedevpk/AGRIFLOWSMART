import { ADMIN_ORDER_COLUMNS, ADMIN_PRODUCT_COLUMNS, ADMIN_PROFILE_COLUMNS, CROP_TIP_COLUMNS } from '@/lib/columns';
import { pageRange, sliceHasMore } from '@/lib/pagination';
import { reportError } from '@/lib/logger';
import { ConfirmationQueue } from '@/components/admin/ConfirmationQueue';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Users, Package, ShoppingBag, TrendingUp, Sprout, ShoppingBag as BuyerIcon, BookOpen, Plus, Trash2, EyeOff, Eye, Search } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardBody, Badge, StatCard, Avatar, EmptyState, ErrorState, LoadingState, Button, Select, Input, Textarea, Pagination } from '@/components/ui';
import { toast } from '@/components/ui/toast-store';
import { DemoNotice } from '@/components/orders/DemoNotice';
import { supabase } from '@/lib/supabase';
import type { Profile, Product, Order, UserRole } from '@/types';
import type { CropTip } from '@/types/agri';
import { CROPS } from '@/lib/agri/crops';
import { formatPrice, formatDate, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, ROLE_LABELS, PRODUCT_STATUS_LABELS } from '@/lib/constants';
import { getProductImage } from '@/lib/image-config';
import { sumByCurrency } from '@/lib/order-display';
import { paymentSummary } from '@/lib/order-workflow';
import { useConfirmAction } from '@/hooks/useConfirmAction';
import { useSeo } from '@/hooks/useSeo';
import { Link } from 'react-router-dom';
import { normalizeText } from '@/lib/agri-match';

export function AdminPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tips, setTips] = useState<CropTip[]>([]);
  const [loading, setLoading] = useState(true);
  const [tipCrop, setTipCrop] = useState(CROPS[0]?.id ?? '');
  const [tipTitle, setTipTitle] = useState('');
  const [tipBody, setTipBody] = useState('');
  const [savingTip, setSavingTip] = useState(false);
  const { request, dialog } = useConfirmAction();
  useSeo({ title: 'Administration | AgriFlow RDC', noindex: true });
  const [error, setError] = useState(false);
  const [counts, setCounts] = useState({ users: 0, producers: 0, buyers: 0, products: 0, available: 0, orders: 0, completed: 0 });
  const [userQuery, setUserQuery] = useState('');
  const [userRole, setUserRole] = useState<'all' | UserRole>('all');
  const [userPage, setUserPage] = useState(1);
  const [orderStatus, setOrderStatus] = useState<'all' | Order['status']>('all');
  const [orderPage, setOrderPage] = useState(1);
  const PAGE_SIZE = 10;
  const ADMIN_PAGE = 50;
  const [more, setMore] = useState({ profiles: false, products: false, orders: false });
  const [loadingMore, setLoadingMore] = useState<null | 'profiles' | 'products' | 'orders'>(null);
  const loadedPages = useRef({ profiles: 1, products: 1, orders: 1 });

  // « Charger plus » : page suivante côté serveur (50 lignes), jamais tout le contenu de la table.
  const loadMoreAdmin = async (kind: 'profiles' | 'products' | 'orders') => {
    if (loadingMore) return;
    setLoadingMore(kind);
    const [from, to] = pageRange(loadedPages.current[kind], ADMIN_PAGE);
    const table = kind === 'profiles' ? supabase.from('profiles').select(ADMIN_PROFILE_COLUMNS) : kind === 'products' ? supabase.from('products').select(ADMIN_PRODUCT_COLUMNS) : supabase.from('orders').select(ADMIN_ORDER_COLUMNS);
    const { data, error: err } = await table.order('created_at', { ascending: false }).order('id').range(from, to);
    if (err) { reportError('AdminPage.loadMoreAdmin', err.message, { kind }); toast('error', 'Impossible de charger la suite. Réessayez.'); setLoadingMore(null); return; }
    const { items, hasMore } = sliceHasMore(data as unknown[] | null, ADMIN_PAGE);
    loadedPages.current[kind] += 1;
    const merge = <T extends { id: string }>(prev: T[]) => { const known = new Set(prev.map((x) => x.id)); return [...prev, ...(items as T[]).filter((x) => !known.has(x.id))]; };
    if (kind === 'profiles') setProfiles(merge); else if (kind === 'products') setProducts(merge); else setOrders(merge);
    setMore((m) => ({ ...m, [kind]: hasMore }));
    setLoadingMore(null);
  };

  const loadTips = () =>
    supabase.from('crop_tips').select(CROP_TIP_COLUMNS).order('created_at', { ascending: false }).limit(100)
      .then(({ data, error }) => { if (!error) setTips((data as CropTip[]) ?? []); });

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const head = { count: 'exact' as const, head: true };
    const [profRes, prodRes, ordRes, tipRes, cUsers, cProducers, cBuyers, cProducts, cAvailable, cOrders, cCompleted] = await Promise.all([
      // Le téléphone n'est jamais exposé en masse, même à l'admin, via '*'
      // (colonne restreinte au niveau base) : cette vue d'ensemble n'en a
      // pas besoin. Un admin peut l'obtenir via get_profile_phone(user_id)
      // si nécessaire pour un profil précis.
      supabase.from('profiles').select(ADMIN_PROFILE_COLUMNS).order('created_at', { ascending: false }).order('id').range(0, ADMIN_PAGE),
      supabase.from('products').select(ADMIN_PRODUCT_COLUMNS).order('created_at', { ascending: false }).order('id').range(0, ADMIN_PAGE),
      supabase.from('orders').select(ADMIN_ORDER_COLUMNS).order('created_at', { ascending: false }).order('id').range(0, ADMIN_PAGE),
      supabase.from('crop_tips').select(CROP_TIP_COLUMNS).order('created_at', { ascending: false }).limit(100),
      // Totaux réels (les listes ci-dessus sont tronquées aux 50 plus récents) ; les policies RLS s'appliquent.
      supabase.from('profiles').select('id', head),
      supabase.from('profiles').select('id', head).in('role', ['producer', 'cooperative']),
      supabase.from('profiles').select('id', head).eq('role', 'buyer'),
      supabase.from('products').select('id', head),
      supabase.from('products').select('id', head).eq('status', 'available'),
      supabase.from('orders').select('id', head),
      supabase.from('orders').select('id', head).eq('status', 'completed'),
    ]);
    if ([profRes, prodRes, ordRes, tipRes, cUsers, cProducers, cBuyers, cProducts, cAvailable, cOrders, cCompleted].some((r) => r.error)) {
      setError(true);
      setLoading(false);
      return;
    }
    const profPage = sliceHasMore(profRes.data as Profile[] | null, ADMIN_PAGE);
    const prodPage = sliceHasMore(prodRes.data as Product[] | null, ADMIN_PAGE);
    const ordPage = sliceHasMore(ordRes.data as unknown as Order[] | null, ADMIN_PAGE);
    setProfiles(profPage.items); setProducts(prodPage.items); setOrders(ordPage.items);
    setMore({ profiles: profPage.hasMore, products: prodPage.hasMore, orders: ordPage.hasMore });
    loadedPages.current = { profiles: 1, products: 1, orders: 1 };
    setTips((tipRes.data as CropTip[]) ?? []);
    setCounts({ users: cUsers.count ?? 0, producers: cProducers.count ?? 0, buyers: cBuyers.count ?? 0, products: cProducts.count ?? 0, available: cAvailable.count ?? 0, orders: cOrders.count ?? 0, completed: cCompleted.count ?? 0 });
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filteredUsers = useMemo(() => {
    const q = normalizeText(userQuery);
    return profiles.filter((p) => (userRole === 'all' || p.role === userRole) && (!q || normalizeText(`${p.full_name} ${p.city ?? ''} ${p.province ?? ''}`).includes(q)));
  }, [profiles, userQuery, userRole]);
  const filteredOrders = useMemo(() => orders.filter((o) => orderStatus === 'all' || o.status === orderStatus), [orders, orderStatus]);

  const addTip = async () => {
    const title = tipTitle.trim();
    const body = tipBody.trim();
    if (!tipCrop || !title || !body) { toast('error', 'Culture, titre et texte du conseil sont obligatoires.'); return; }
    setSavingTip(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from('crop_tips').insert({
      crop_id: tipCrop, title, body, created_by: userData.user?.id ?? null,
    });
    setSavingTip(false);
    if (error) { toast('error', 'Impossible d\'ajouter ce conseil : ' + error.message); return; }
    setTipTitle(''); setTipBody('');
    toast('success', 'Conseil ajouté.');
    void loadTips();
  };

  const toggleTip = async (tip: CropTip) => {
    const { error } = await supabase.from('crop_tips').update({ is_active: !tip.is_active }).eq('id', tip.id);
    if (error) { toast('error', 'Action impossible : ' + error.message); return; }
    setTips((list) => list.map((t) => (t.id === tip.id ? { ...t, is_active: !t.is_active } : t)));
    toast('success', tip.is_active ? 'Conseil masqué.' : 'Conseil publié.');
  };

  const removeTip = async (tip: CropTip) => {
    const { error } = await supabase.from('crop_tips').delete().eq('id', tip.id);
    if (error) { toast('error', 'Suppression impossible : ' + error.message); return; }
    setTips((list) => list.filter((t) => t.id !== tip.id));
    toast('success', 'Conseil supprimé.');
  };
  const deleteTip = (tip: CropTip) =>
    request({ title: 'Supprimer ce conseil ?', description: `« ${tip.title} » sera supprimé définitivement.`, confirmLabel: 'Supprimer', destructive: true, run: () => removeTip(tip) });

  // Actions admin : l'autorisation réelle est portée par les policies RLS (is_admin()).
  const setVerified = async (p: Profile, value: boolean) => {
    const { error } = await supabase.from('profiles').update({ is_verified: value }).eq('user_id', p.user_id);
    if (error) { toast('error', 'Action refusée ou impossible : ' + error.message); return; }
    setProfiles((list) => list.map((x) => (x.user_id === p.user_id ? { ...x, is_verified: value } : x)));
    toast('success', value ? 'Compte vérifié.' : 'Vérification retirée.');
  };

  const setRole = async (p: Profile, role: UserRole) => {
    const { error } = await supabase.from('profiles').update({ role }).eq('user_id', p.user_id);
    if (error) { toast('error', 'Changement de rôle impossible : ' + error.message); return; }
    setProfiles((list) => list.map((x) => (x.user_id === p.user_id ? { ...x, role } : x)));
    toast('success', 'Rôle mis à jour.');
  };

  const setProductStatus = async (p: Product, status: Product['status']) => {
    const { error } = await supabase.from('products').update({ status }).eq('id', p.id);
    if (error) { toast('error', 'Modification impossible : ' + error.message); return; }
    setProducts((list) => list.map((x) => (x.id === p.id ? { ...x, status } : x)));
    toast('success', status === 'available' ? 'Offre publiée.' : 'Offre masquée.');
  };

  const removeProduct = async (p: Product) => {
    const { error } = await supabase.from('products').delete().eq('id', p.id);
    if (error) { toast('error', 'Suppression impossible : ' + error.message); return; }
    setProducts((list) => list.filter((x) => x.id !== p.id));
    toast('success', 'Offre supprimée.');
  };
  const deleteProduct = (p: Product) =>
    request({ title: 'Supprimer cette offre ?', description: `« ${p.name} » sera supprimée définitivement.`, confirmLabel: 'Supprimer', destructive: true, run: () => removeProduct(p) });

  if (loading) return <DashboardLayout title="Administration"><LoadingState /></DashboardLayout>;
  if (error) return <DashboardLayout title="Administration"><ErrorState title="Impossible de charger l'administration" message="Vérifiez votre connexion et vos droits d'accès, puis réessayez." onRetry={() => void load()} /></DashboardLayout>;

  const paidVolume = sumByCurrency(orders.filter((o) => o.payment_status === 'paid'));
  const legacyDemoOrders = orders.filter((o) => o.payment_status === 'demo_paid').length;

  return (
    <DashboardLayout title="Administration">
      {dialog}
      <div className="space-y-8">
        {legacyDemoOrders > 0 && (
          <DemoNotice>
            {`${legacyDemoOrders} commande(s) créée(s) avant la mise en production du paiement réel conservent un statut « démonstration » historique. Elles n'ont jamais débité de montant réel.`}
          </DemoNotice>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Utilisateurs" value={counts.users} icon={<Users className="h-5 w-5" />} accent="brand" />
          <StatCard label="Producteurs" value={counts.producers} icon={<Sprout className="h-5 w-5" />} accent="emerald" />
          <StatCard label="Acheteurs" value={counts.buyers} icon={<BuyerIcon className="h-5 w-5" />} accent="blue" />
          <StatCard label="Volume payé · 50 dernières commandes" value={paidVolume} icon={<TrendingUp className="h-5 w-5" />} accent="amber" />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Productions" value={counts.products} icon={<Package className="h-5 w-5" />} accent="brand" />
          <StatCard label="Commandes" value={counts.orders} icon={<ShoppingBag className="h-5 w-5" />} accent="blue" />
          <StatCard label="Disponibles" value={counts.available} icon={<Package className="h-5 w-5" />} accent="emerald" />
          <StatCard label="Terminées" value={counts.completed} icon={<ShoppingBag className="h-5 w-5" />} accent="emerald" />
        </div>

        {/* Conseils agricoles (contenu administrable, affiché dans AgriGuide) */}
        <div>
          <h2 className="text-lg font-semibold text-charcoal mb-4 flex items-center gap-2"><BookOpen className="h-5 w-5" /> Conseils agricoles</h2>
          <Card className="mb-4">
            <CardBody className="space-y-3">
              <p className="text-sm text-charcoal/60">
                Ces conseils s'ajoutent aux fiches culture d'AgriGuide sans modifier les étapes de base. Seuls les conseils publiés sont visibles par les producteurs.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Select label="Culture" options={CROPS.map((c) => ({ value: c.id, label: c.name }))} value={tipCrop} onChange={(e) => setTipCrop(e.target.value)} />
                <Input label="Titre" value={tipTitle} onChange={(e) => setTipTitle(e.target.value)} placeholder="Ex. Attention aux excès d'eau" className="sm:col-span-2" />
              </div>
              <Textarea label="Texte du conseil" value={tipBody} onChange={(e) => setTipBody(e.target.value)} rows={3} placeholder="Conseil concret, sans donnée inventée." />
              <Button onClick={() => void addTip()} disabled={savingTip}><Plus className="h-4 w-4" /> Publier ce conseil</Button>
            </CardBody>
          </Card>
          {tips.length === 0 ? (
            <Card><CardBody><EmptyState icon={<BookOpen className="h-8 w-8" />} title="Aucun conseil" description="Les conseils que vous publiez apparaîtront dans AgriGuide pour la culture concernée." /></CardBody></Card>
          ) : (
            <div className="space-y-3">
              {tips.map((tip) => {
                const crop = CROPS.find((c) => c.id === tip.crop_id);
                return (
                  <Card key={tip.id}>
                    <CardBody className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="brand">{crop?.name ?? tip.crop_id}</Badge>
                          <Badge variant={tip.is_active ? 'success' : 'neutral'} dot>{tip.is_active ? 'Publié' : 'Masqué'}</Badge>
                        </div>
                        <h3 className="mt-2 font-semibold text-charcoal">{tip.title}</h3>
                        <p className="text-sm text-charcoal/60">{tip.body}</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button variant="outline" size="sm" onClick={() => void toggleTip(tip)}>
                          {tip.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => void deleteTip(tip)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent users */}
        <div>
          <h2 className="mb-1 text-lg font-semibold text-charcoal">Utilisateurs</h2>
          <p className="mb-4 text-sm text-charcoal/55">Les 50 inscriptions les plus récentes sur {counts.users}.</p>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal/40" aria-hidden="true" />
              <input type="search" value={userQuery} onChange={(e) => { setUserQuery(e.target.value); setUserPage(1); }} aria-label="Rechercher un utilisateur" placeholder="Nom ou localisation" className="h-11 w-full rounded-xl border border-black/[0.08] bg-offwhite pl-10 pr-3 text-sm text-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-white/10" />
            </div>
            <select value={userRole} onChange={(e) => { setUserRole(e.target.value as 'all' | UserRole); setUserPage(1); }} aria-label="Filtrer par rôle" className="h-11 rounded-xl border border-black/[0.08] bg-offwhite px-3 text-sm text-charcoal dark:border-white/10">
              <option value="all">Tous les rôles</option>
              {Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          {profiles.length === 0 ? (
            <Card><CardBody><EmptyState icon={<Users className="h-8 w-8" />} title="Aucun utilisateur" /></CardBody></Card>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-brand-100">
                    <tr className="text-left text-xs text-charcoal/60 uppercase tracking-wide">
                      <th className="px-5 py-3 font-medium">Utilisateur</th>
                      <th className="px-5 py-3 font-medium">Rôle</th>
                      <th className="px-5 py-3 font-medium">Localisation</th>
                      <th className="px-5 py-3 font-medium">Inscrit le</th>
                      <th className="px-5 py-3 font-medium">Statut</th>
                      <th className="px-5 py-3 font-medium">Contrôle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-100">
                    {filteredUsers.slice((userPage - 1) * PAGE_SIZE, userPage * PAGE_SIZE).map((p) => (
                      <tr key={p.id} className="hover:bg-cream">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={p.full_name} src={p.avatar_url} size="sm" />
                            <span className="text-sm font-medium text-charcoal">{p.full_name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3"><Badge variant="neutral">{ROLE_LABELS[p.role]}</Badge></td>
                        <td className="px-5 py-3 text-sm text-charcoal/60">{p.city || p.province || '—'}</td>
                        <td className="px-5 py-3 text-sm text-charcoal/60">{formatDate(p.created_at)}</td>
                        <td className="px-5 py-3">{p.is_verified ? <Badge variant="success" dot>Vérifié</Badge> : <Badge variant="neutral">Non vérifié</Badge>}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <select
                              value={p.role}
                              onChange={(e) => void setRole(p, e.target.value as UserRole)}
                              aria-label={`Rôle de ${p.full_name}`}
                              className="h-9 rounded-lg border border-brand-200 bg-offwhite px-2 text-sm text-charcoal/80"
                            >
                              {Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                            <Button size="sm" variant={p.is_verified ? 'outline' : 'primary'} onClick={() => void setVerified(p, !p.is_verified)}>
                              {p.is_verified ? 'Retirer' : 'Vérifier'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredUsers.length === 0 && <p className="px-5 py-8 text-center text-sm text-charcoal/60">Aucun utilisateur ne correspond à cette recherche.</p>}
              <Pagination page={userPage} pageSize={PAGE_SIZE} total={filteredUsers.length} onPageChange={setUserPage} label="Pagination des utilisateurs" />
              {more.profiles && <div className="flex justify-center border-t border-brand-100 p-3"><Button size="sm" variant="outline" loading={loadingMore === 'profiles'} onClick={() => void loadMoreAdmin('profiles')}>Charger 50 utilisateurs de plus</Button></div>}
            </Card>
          )}
        </div>

        {/* Recent products */}
        <div>
          <h2 className="text-lg font-semibold text-charcoal mb-4">Productions récentes</h2>
          {products.length === 0 ? (
            <Card><CardBody><EmptyState icon={<Package className="h-8 w-8" />} title="Aucune production" /></CardBody></Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {products.slice(0, 12).map((p) => (
                <Card key={p.id}>
                  <CardBody className="flex gap-3">
                    <img src={p.images?.[0] || getProductImage(p.name)} alt="" className="h-16 w-16 rounded-xl object-cover" />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-charcoal truncate">{p.name}</h3>
                      <p className="text-sm text-charcoal/60">{formatPrice(p.price, p.currency)}</p>
                      <p className="text-xs text-charcoal/40">{p.city || p.province || '—'}</p>
                      <Badge variant={p.status === 'available' ? 'success' : 'neutral'} dot className="mt-1">{PRODUCT_STATUS_LABELS[p.status]}</Badge>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => void setProductStatus(p, p.status === 'available' ? 'draft' : 'available')}>
                          {p.status === 'available' ? 'Masquer' : 'Publier'}
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => void deleteProduct(p)}>Supprimer</Button>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </div>

        <ConfirmationQueue />

        {/* Recent orders */}
        <div>
          <h2 className="mb-1 text-lg font-semibold text-charcoal">Commandes</h2>
          <p className="mb-4 text-sm text-charcoal/55">Les 50 commandes les plus récentes sur {counts.orders}.</p>
          <div className="mb-4">
            <select value={orderStatus} onChange={(e) => { setOrderStatus(e.target.value as 'all' | Order['status']); setOrderPage(1); }} aria-label="Filtrer les commandes par statut" className="h-11 rounded-xl border border-black/[0.08] bg-offwhite px-3 text-sm text-charcoal dark:border-white/10">
              <option value="all">Tous les statuts</option>
              {Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          {orders.length === 0 ? (
            <Card><CardBody><EmptyState icon={<ShoppingBag className="h-8 w-8" />} title="Aucune commande" /></CardBody></Card>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-brand-100">
                    <tr className="text-left text-xs text-charcoal/60 uppercase tracking-wide">
                      <th className="px-5 py-3 font-medium">N°</th>
                      <th className="px-5 py-3 font-medium">Montant</th>
                      <th className="px-5 py-3 font-medium">Statut</th>
                      <th className="px-5 py-3 font-medium">Paiement</th>
                      <th className="px-5 py-3 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-100">
                    {filteredOrders.slice((orderPage - 1) * PAGE_SIZE, orderPage * PAGE_SIZE).map((o) => (
                      <tr key={o.id} className="hover:bg-cream">
                        <td className="px-5 py-3 text-sm font-mono"><Link to={`/orders/${o.id}`} className="text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">#{o.order_number}</Link></td>
                        <td className="px-5 py-3 text-sm font-medium text-charcoal">{formatPrice(o.total_amount, o.currency)}</td>
                        <td className="px-5 py-3"><Badge className={ORDER_STATUS_COLORS[o.status]}>{ORDER_STATUS_LABELS[o.status]}</Badge></td>
                        <td className="px-5 py-3 text-sm text-charcoal/60">{paymentSummary(o.payment_method, o.payment_status, o.status).label}</td>
                        <td className="px-5 py-3 text-sm text-charcoal/60">{formatDate(o.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredOrders.length === 0 && <p className="px-5 py-8 text-center text-sm text-charcoal/60">Aucune commande avec ce statut.</p>}
              <Pagination page={orderPage} pageSize={PAGE_SIZE} total={filteredOrders.length} onPageChange={setOrderPage} label="Pagination des commandes" />
              {more.orders && <div className="flex justify-center border-t border-brand-100 p-3"><Button size="sm" variant="outline" loading={loadingMore === 'orders'} onClick={() => void loadMoreAdmin('orders')}>Charger 50 commandes de plus</Button></div>}
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
