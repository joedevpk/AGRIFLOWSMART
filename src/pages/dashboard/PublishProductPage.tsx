import { PRODUCT_DETAIL_COLUMNS } from '@/lib/columns';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ImagePlus, X, Eye, Loader2, Star } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Input, Select, Textarea, Button, Card, CardBody, SmartImage, LoadingState, ErrorState } from '@/components/ui';
import { ProductCard } from '@/components/ui/ProductCard';
import { toast } from '@/components/ui/toast-store';
import { useAuth } from '@/contexts/auth-context';
import { supabase } from '@/lib/supabase';
import { CATEGORIES, PRODUCTS_CATALOG, UNITS, PROVINCES, UNIT_LABELS, PRODUCT_STATUS_LABELS } from '@/lib/constants';
import { getProductImage } from '@/lib/image-config';
import {
  ACCEPTED_IMAGE_TYPES, MAX_PRODUCT_PHOTOS, removeProductImage, uploadProductImage,
} from '@/lib/image-upload';
import type { Product, ProductStatus, ProductWithProfile } from '@/types';
import { cn } from '@/lib/utils';
import { useConnection } from '@/contexts/sync-context';
import { getCrop } from '@/lib/agri/crops';
import { getZone } from '@/lib/agri/zones';
import { readJSON, removeKey, storageKey, writeJSON } from '@/lib/offline/storage';

/** Brouillon de publication conservé sur l'appareil (texte uniquement, pas les photos). */
interface ProductDraft {
  name: string; category: string; variety: string; quantity: string; unit: string; price: string; priceNegotiable: boolean;
  province: string; city: string; availMode: 'now' | 'date'; availabilityDate: string; description: string; currency: string;
}

/** Photo d'une offre : `path` est connu pour les photos hébergées dans le bucket AgriFlow. */
interface PhotoItem { url: string; path: string | null; isNew: boolean }

const BUCKET_MARKER = '/product-images/';
function storagePathFromUrl(url: string): string | null {
  const i = url.indexOf(BUCKET_MARKER);
  return i === -1 ? null : decodeURIComponent(url.slice(i + BUCKET_MARKER.length).split('?')[0]);
}

const EDITABLE_STATUSES: ProductStatus[] = ['available', 'reserved', 'sold_out', 'draft'];

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 border-t border-black/[0.06] pt-6 first:border-t-0 first:pt-0">
      <h2 className="flex items-center gap-2.5 text-base font-bold text-charcoal">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function PublishProductPage() {
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id: string }>();
  const isEdit = Boolean(editId);
  const { user, profile } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [variety, setVariety] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('kg');
  const [price, setPrice] = useState('');
  const [priceNegotiable, setPriceNegotiable] = useState(false);
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [availMode, setAvailMode] = useState<'now' | 'date'>('now');
  const [availabilityDate, setAvailabilityDate] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [currency, setCurrency] = useState('USD');
  const [status, setStatus] = useState<ProductStatus>('available');
  const [removedPaths, setRemovedPaths] = useState<string[]>([]);
  const [initLoading, setInitLoading] = useState(isEdit);
  const [initError, setInitError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [searchParams] = useSearchParams();
  const connection = useConnection();
  const draftKey = user ? storageKey(user.id, 'draft:product') : null;
  const draftReady = useRef(false);

  // Nouvelle offre : préremplissage depuis AgriGuide / Ma Parcelle (?crop=…&qty=…&unit=…&zone=…), sinon restauration du brouillon local.
  useEffect(() => {
    if (isEdit || !user || !draftKey || draftReady.current) return;
    draftReady.current = true;
    const crop = getCrop(searchParams.get('crop'));
    if (crop) {
      setName(crop.marketName);
      const cat = PRODUCTS_CATALOG.find((p) => p.name === crop.marketName);
      if (cat) setCategory(cat.category);
      const q = Number(searchParams.get('qty'));
      if (q > 0) setQuantity(String(q));
      const u = searchParams.get('unit');
      if (u && (UNITS as readonly string[]).includes(u)) setUnit(u);
      const zone = getZone(searchParams.get('zone'));
      if (zone && (PROVINCES as readonly string[]).includes(zone.name)) setProvince(zone.name);
      return;
    }
    const d = readJSON<ProductDraft | null>(draftKey, null);
    if (d && (d.name || d.quantity || d.price || d.description)) {
      setName(d.name); setCategory(d.category); setVariety(d.variety); setQuantity(d.quantity); setUnit(d.unit); setPrice(d.price);
      setPriceNegotiable(d.priceNegotiable); setProvince(d.province); setCity(d.city); setAvailMode(d.availMode);
      setAvailabilityDate(d.availabilityDate); setDescription(d.description); setCurrency(d.currency);
      toast('info', 'Brouillon restauré depuis cet appareil.');
    }
  }, [isEdit, user, draftKey, searchParams]);

  // Sauvegarde automatique du brouillon (fonctionne hors connexion).
  useEffect(() => {
    if (isEdit || !draftKey || !draftReady.current) return;
    const t = setTimeout(() => {
      if (!name && !quantity && !price && !description && !variety && !city) { removeKey(draftKey); return; }
      writeJSON(draftKey, { name, category, variety, quantity, unit, price, priceNegotiable, province, city, availMode, availabilityDate, description, currency } satisfies ProductDraft);
    }, 600);
    return () => clearTimeout(t);
  }, [isEdit, draftKey, name, category, variety, quantity, unit, price, priceNegotiable, province, city, availMode, availabilityDate, description, currency]);

  // Mode « Modifier » : charge l'offre du producteur connecté et pré-remplit le formulaire.
  useEffect(() => {
    if (!editId || !user) return;
    let cancelled = false;
    supabase.from('products').select(PRODUCT_DETAIL_COLUMNS).eq('id', editId).eq('user_id', user.id).maybeSingle().then(({ data, error }) => {
      if (cancelled) return;
      if (error) { setInitError('Impossible de charger cette production. Vérifiez votre connexion puis réessayez.'); setInitLoading(false); return; }
      if (!data) { setInitError('Cette production n\'existe pas ou ne vous appartient pas.'); setInitLoading(false); return; }
      const p = data as Product;
      setName(p.name);
      setCategory(p.category);
      setVariety(p.variety ?? '');
      setQuantity(String(p.quantity));
      setUnit(p.unit);
      setPrice(String(p.price));
      setCurrency(p.currency || 'USD');
      setPriceNegotiable(p.price_negotiable);
      setProvince(p.province ?? '');
      setCity(p.city ?? '');
      setAvailMode(p.availability_date ? 'date' : 'now');
      setAvailabilityDate(p.availability_date ?? '');
      setDescription(p.description ?? '');
      setStatus(p.status);
      // L'image générique du produit (sans photo) n'est pas une photo du producteur : on ne la recharge pas.
      setPhotos((p.images ?? []).filter((u) => storagePathFromUrl(u) !== null).map((u) => ({ url: u, path: storagePathFromUrl(u), isNew: false })));
      setInitLoading(false);
    });
    return () => { cancelled = true; };
  }, [editId, user]);

  const pickProduct = (n: string) => {
    setName(n);
    const cat = PRODUCTS_CATALOG.find((p) => p.name === n);
    if (cat) setCategory(cat.category);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Le produit est requis';
    if (!category) e.category = 'La catégorie est requise';
    if (!quantity || Number(quantity) <= 0) e.quantity = 'La quantité doit être positive';
    if (!price || Number(price) <= 0) e.price = 'Le prix doit être positif';
    if (!province) e.province = 'La province est requise';
    if (availMode === 'date' && !availabilityDate) e.availability = 'Choisissez une date';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || !user) return;
    const room = MAX_PRODUCT_PHOTOS - photos.length;
    if (room <= 0) { toast('error', `${MAX_PRODUCT_PHOTOS} photos maximum.`); return; }
    const selected = Array.from(files).slice(0, room);
    if (files.length > room) toast('info', `Seules ${room} photo(s) supplémentaire(s) ont été retenues.`);
    setUploading((n) => n + selected.length);
    const results = await Promise.allSettled(selected.map((f) => uploadProductImage(user.id, f)));
    const ok: PhotoItem[] = [];
    results.forEach((r) => {
      if (r.status === 'fulfilled') ok.push({ ...r.value, isNew: true });
      else toast('error', r.reason instanceof Error ? r.reason.message : 'Échec de l\'envoi de la photo.');
    });
    setPhotos((prev) => [...prev, ...ok]);
    setUploading((n) => n - selected.length);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removePhoto = (idx: number) => {
    const target = photos[idx];
    setPhotos(photos.filter((_, i) => i !== idx));
    if (!target?.path) return;
    // Photo envoyée pendant cette session : supprimée tout de suite. Photo déjà publiée : supprimée seulement à l'enregistrement.
    if (target.isNew) void removeProductImage(target.path).catch(() => undefined);
    else setRemovedPaths((prev) => [...prev, target.path as string]);
  };

  const makeCover = (idx: number) => {
    if (idx === 0) return;
    const next = [...photos];
    const [p] = next.splice(idx, 1);
    next.unshift(p);
    setPhotos(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || !user) return;
    if (connection === 'offline') { toast('error', 'Une connexion est nécessaire pour publier. Votre brouillon est conservé sur cet appareil.'); return; }
    if (uploading > 0) { toast('info', 'Patientez, envoi des photos en cours…'); return; }
    setLoading(true);
    const images = photos.length > 0 ? photos.map((p) => p.url) : [getProductImage(name.trim())];
    const fields = {
      name: name.trim(),
      category,
      variety: variety.trim() || null,
      quantity: Number(quantity),
      unit,
      price: Number(price),
      price_negotiable: priceNegotiable,
      province,
      city: city.trim() || null,
      availability_date: availMode === 'date' ? availabilityDate : null,
      description: description.trim() || null,
      images,
    };
    if (isEdit && editId) {
      const { error } = await supabase.from('products').update({ ...fields, status }).eq('id', editId).eq('user_id', user.id);
      setLoading(false);
      if (error) { toast('error', 'Les modifications n\'ont pas pu être enregistrées. Réessayez.'); return; }
      await Promise.all(removedPaths.map((path) => removeProductImage(path).catch(() => undefined)));
      toast('success', 'Production mise à jour.');
      navigate('/producer/products');
      return;
    }
    const { error } = await supabase.from('products').insert({
      user_id: user.id,
      ...fields,
      currency: 'USD',
      status: 'available' as ProductStatus,
    });
    setLoading(false);
    if (error) {
      const msg = error.message ?? '';
      if (/failed to fetch|network|connection/i.test(msg)) toast('error', 'Connexion à la base impossible. Vérifiez votre réseau et que le projet Supabase est actif, puis réessayez.');
      else if (error.code === '42501' || /row-level security/i.test(msg)) toast('error', 'Votre compte n\'est pas autorisé à publier : il faut un profil producteur, coopérative ou admin.');
      else toast('error', msg);
      return;
    }
    if (draftKey) removeKey(draftKey);
    toast('success', 'Votre production est maintenant visible par les acheteurs.');
    navigate('/producer/products');
  };

  // Aperçu : exactement la ProductCard de la marketplace, alimentée par la saisie.
  const previewProduct = useMemo<ProductWithProfile>(() => ({
    id: 'preview',
    user_id: user?.id ?? '',
    name: name.trim(),
    category,
    variety: variety || null,
    quantity: Number(quantity) || 0,
    unit,
    price: Number(price) || 0,
    currency,
    price_negotiable: priceNegotiable,
    province: province || null,
    city: city.trim() || null,
    latitude: null,
    longitude: null,
    availability_date: availMode === 'date' && availabilityDate ? availabilityDate : null,
    description: description || null,
    images: photos.map((p) => p.url),
    status,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    profiles: {
      full_name: profile?.full_name ?? 'Vous',
      city: profile?.city ?? null,
      province: profile?.province ?? null,
      avatar_url: profile?.avatar_url ?? null,
      is_verified: profile?.is_verified ?? false,
      role: profile?.role ?? 'producer',
    },
  }), [user?.id, name, category, variety, quantity, unit, price, currency, status, priceNegotiable, province, city, availMode, availabilityDate, description, photos, profile]);

  const pageTitle = isEdit ? 'Modifier ma production' : 'Publier une production';
  if (initLoading) return <DashboardLayout title={pageTitle}><LoadingState /></DashboardLayout>;
  if (initError) return <DashboardLayout title={pageTitle}><ErrorState message={initError} onRetry={isEdit ? () => navigate('/producer/products') : undefined} retryLabel="Retour à mes productions" /></DashboardLayout>;

  const previewCard = <ProductCard product={{ ...previewProduct, name: previewProduct.name || 'Nom du produit' }} preview />;

  return (
    <DashboardLayout title={pageTitle}>
      <div className="mx-auto max-w-6xl pb-24 lg:pb-0">
        <button type="button" onClick={() => navigate('/producer/products')} className="mb-6 inline-flex items-center gap-2 text-sm text-charcoal/50 hover:text-charcoal">
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>

        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <Card>
            <CardBody>
              <form onSubmit={handleSubmit} className="space-y-8" noValidate>
                <Section n={1} title="Produit">
                  <div>
                    <label htmlFor="product-name" className="mb-1.5 block text-sm font-medium text-charcoal/70">Nom du produit</label>
                    <input
                      id="product-name"
                      value={name}
                      maxLength={80}
                      onChange={(e) => pickProduct(e.target.value)}
                      list="products-list"
                      placeholder="Maïs, Tomate, Manioc..."
                      className={cn('w-full rounded-xl border bg-offwhite px-4 py-2.5 text-sm text-charcoal placeholder:text-charcoal/35 focus:outline-none focus:ring-4', errors.name ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/10' : 'border-black/[0.08] focus:border-brand-500 focus:ring-brand-500/10')}
                    />
                    <datalist id="products-list">{PRODUCTS_CATALOG.map((p) => <option key={p.name} value={p.name} />)}</datalist>
                    {errors.name && <p className="mt-1 text-xs text-rose-600">{errors.name}</p>}
                    <div className="-mx-1 mt-2.5 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide" role="group" aria-label="Produits courants">
                      {PRODUCTS_CATALOG.map((p) => (
                        <button key={p.name} type="button" onClick={() => pickProduct(p.name)} aria-pressed={name === p.name} className={cn('chip', name === p.name ? 'chip-active' : 'chip-idle')}>{p.name}</button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Select label="Catégorie" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Sélectionner" options={CATEGORIES.map((c) => ({ value: c.id, label: c.label }))} error={errors.category} />
                    <Input label="Variété (optionnel)" placeholder="Ex : maïs jaune, tomate Roma..." value={variety} maxLength={60} onChange={(e) => setVariety(e.target.value)} />
                  </div>
                </Section>

                <Section n={2} title="Quantité et prix">
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Quantité" type="number" inputMode="decimal" min="0" placeholder="500" value={quantity} onChange={(e) => setQuantity(e.target.value)} error={errors.quantity} />
                    <Select label="Unité" value={unit} onChange={(e) => setUnit(e.target.value)} options={UNITS.map((u) => ({ value: u, label: UNIT_LABELS[u] || u }))} />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Input label={`Prix par unité (${currency})`} type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.50" value={price} onChange={(e) => setPrice(e.target.value)} error={errors.price} />
                    <label className="flex cursor-pointer items-center gap-2 sm:pt-7">
                      <input type="checkbox" checked={priceNegotiable} onChange={(e) => setPriceNegotiable(e.target.checked)} className="h-4 w-4 rounded border-black/20 text-brand-600 focus:ring-brand-500" />
                      <span className="text-sm text-charcoal/70">Prix négociable</span>
                    </label>
                  </div>
                </Section>

                <Section n={3} title="Localisation et disponibilité">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Select label="Province" value={province} onChange={(e) => setProvince(e.target.value)} placeholder="Sélectionner" options={PROVINCES.map((p) => ({ value: p, label: p }))} error={errors.province} />
                    <Input label="Ville (optionnel)" placeholder="Kinshasa" value={city} maxLength={60} onChange={(e) => setCity(e.target.value)} />
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium text-charcoal/70">Disponibilité</p>
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Disponibilité">
                      <button type="button" aria-pressed={availMode === 'now'} onClick={() => setAvailMode('now')} className={cn('chip', availMode === 'now' ? 'chip-active' : 'chip-idle')}>Disponible maintenant</button>
                      <button type="button" aria-pressed={availMode === 'date'} onClick={() => setAvailMode('date')} className={cn('chip', availMode === 'date' ? 'chip-active' : 'chip-idle')}>À partir d'une date</button>
                    </div>
                    {availMode === 'date' && (
                      <div className="mt-3 max-w-xs">
                        <Input label="Disponible à partir du" type="date" value={availabilityDate} onChange={(e) => setAvailabilityDate(e.target.value)} error={errors.availability} />
                      </div>
                    )}
                  </div>
                  {isEdit && (
                    <div className="max-w-xs">
                      <Select
                        label="Statut de l'offre"
                        value={status}
                        onChange={(e) => setStatus(e.target.value as ProductStatus)}
                        options={EDITABLE_STATUSES.map((st) => ({ value: st, label: PRODUCT_STATUS_LABELS[st] }))}
                      />
                      <p className="mt-1 text-xs text-charcoal/40">Seules les offres « Disponible » sont visibles et commandables par les acheteurs.</p>
                    </div>
                  )}
                </Section>

                <Section n={4} title="Photos et description">
                  <div>
                    <div className="flex flex-wrap gap-3">
                      {photos.map((ph, i) => (
                        <div key={ph.path ?? ph.url} className="group relative h-24 w-24 overflow-hidden rounded-xl border border-black/[0.08]">
                          <SmartImage src={ph.url} alt={`Photo ${i + 1} de ${name || 'votre production'}`} sizes="96px" />
                          {i === 0 && <span className="absolute bottom-1 left-1 rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">Couverture</span>}
                          <button type="button" onClick={() => removePhoto(i)} aria-label={`Supprimer la photo ${i + 1}`} className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-charcoal/70 text-white"><X className="h-3.5 w-3.5" /></button>
                          {i > 0 && (
                            <button type="button" onClick={() => makeCover(i)} aria-label={`Définir la photo ${i + 1} comme couverture`} className="absolute bottom-1 left-1 flex h-7 w-7 items-center justify-center rounded-full bg-offwhite/90 text-charcoal"><Star className="h-3.5 w-3.5" /></button>
                          )}
                        </div>
                      ))}
                      {Array.from({ length: uploading }).map((_, i) => (
                        <div key={`up-${i}`} className="flex h-24 w-24 items-center justify-center rounded-xl border border-black/[0.08] bg-sage/50" role="status" aria-label="Envoi de la photo">
                          <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
                        </div>
                      ))}
                      {photos.length + uploading < MAX_PRODUCT_PHOTOS && (
                        <button type="button" onClick={() => fileRef.current?.click()} className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-black/15 text-charcoal/40 transition-colors hover:border-brand-400 hover:text-brand-600">
                          <ImagePlus className="h-6 w-6" /><span className="text-[11px] font-medium">Ajouter</span>
                        </button>
                      )}
                    </div>
                    <input ref={fileRef} type="file" accept={ACCEPTED_IMAGE_TYPES.join(',')} multiple className="sr-only" aria-label="Ajouter des photos" onChange={(e) => void handleFiles(e.target.files)} />
                    <p className="mt-2 text-xs text-charcoal/40">
                      Jusqu'à {MAX_PRODUCT_PHOTOS} photos (JPG, PNG, WebP), compressées automatiquement. La première est la couverture. Sans photo, une image générique du produit est utilisée.
                    </p>
                  </div>
                  <Textarea label="Description (optionnel)" rows={4} maxLength={1500} placeholder="Qualité, méthode de culture, conditions de stockage, modalités de livraison..." value={description} onChange={(e) => setDescription(e.target.value)} />
                </Section>

                <div className="flex gap-3 border-t border-black/[0.06] pt-6">
                  <Button type="button" variant="outline" onClick={() => navigate('/producer/products')}>Annuler</Button>
                  <Button type="submit" fullWidth loading={loading} disabled={uploading > 0}>{isEdit ? 'Enregistrer les modifications' : 'Publier la production'}</Button>
                </div>
              </form>
            </CardBody>
          </Card>

          {/* Aperçu live — colonne collante sur desktop */}
          <aside className="hidden lg:block lg:sticky lg:top-24" aria-label="Aperçu de la carte produit">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-charcoal/40">Aperçu — tel que les acheteurs le verront</p>
            {previewCard}
            <p className="mt-3 text-center text-xs text-charcoal/40">L'aperçu se met à jour au fur et à mesure de votre saisie.</p>
          </aside>
        </div>
      </div>

      {/* Aperçu mobile : bouton flottant + feuille */}
      <button
        type="button"
        onClick={() => setPreviewOpen(true)}
        className="lg:hidden fixed bottom-above-nav mb-4 right-4 z-40 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-accent-400 px-5 py-3 text-sm font-bold text-charcoal shadow-lift"
      >
        <Eye className="h-4 w-4" /> Aperçu
      </button>
      {previewOpen && (
        <div className="lg:hidden fixed inset-0 z-[70] flex items-end" role="dialog" aria-modal="true" aria-label="Aperçu de la carte produit">
          <div className="absolute inset-0 bg-charcoal/50" onClick={() => setPreviewOpen(false)} />
          <div className="relative max-h-sheet w-full overflow-y-auto rounded-t-3xl bg-cream p-4 pb-[max(2rem,env(safe-area-inset-bottom))] animate-slide-up">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold text-charcoal">Aperçu de votre carte</p>
              <button type="button" onClick={() => setPreviewOpen(false)} aria-label="Fermer l'aperçu" className="flex h-11 w-11 items-center justify-center rounded-full text-charcoal/50 hover:bg-black/5"><X className="h-5 w-5" /></button>
            </div>
            {previewCard}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
