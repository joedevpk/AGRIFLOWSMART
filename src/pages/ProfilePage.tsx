import { ProducerAvailabilityCard } from '@/components/availability/ProducerAvailabilityCard';
import { useEffect, useRef, useState } from 'react';
import { Camera, Save, Trash2 } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardBody, Input, Select, Textarea, Button, Avatar, Badge } from '@/components/ui';
import { toast } from '@/components/ui/toast-store';
import { useAuth } from '@/contexts/auth-context';
import { supabase } from '@/lib/supabase';
import { PROVINCES, ROLE_LABELS, BUYER_TYPE_LABELS } from '@/lib/constants';
import { ACCEPTED_IMAGE_TYPES, uploadAvatar } from '@/lib/image-upload';
import { useSeo } from '@/hooks/useSeo';
import { PrivacySettings } from '@/components/account/PrivacySettings';

export function ProfilePage() {
  useSeo({ title: 'Mon profil | AgriFlow RDC', noindex: true });
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { user, profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name);
      setPhone(profile.phone || '');
      setProvince(profile.province || '');
      setCity(profile.city || '');
      setBio(profile.bio || '');
      setAvatarUrl(profile.avatar_url || '');
    }
  }, [profile]);

  const onPickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user) return;
    setUploading(true);
    try {
      const { url } = await uploadAvatar(user.id, file);
      setAvatarUrl(url);
      toast('success', 'Photo prête : enregistrez le profil pour la conserver.');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'La photo n\'a pas pu être envoyée.');
    }
    setUploading(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      full_name: fullName,
      phone: phone || null,
      province: province || null,
      city: city || null,
      bio: bio || null,
      avatar_url: avatarUrl || null,
      updated_at: new Date().toISOString(),
    }).eq('user_id', user.id);
    setSaving(false);
    if (error) { toast('error', error.message); return; }
    toast('success', 'Profil mis à jour avec succès.');
    refreshProfile();
  };

  if (!profile) return null;

  return (
    <DashboardLayout title="Mon profil">
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardBody>
            <div className="mb-2 flex flex-wrap items-center gap-4">
              <Avatar name={fullName} src={avatarUrl} size="xl" />
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-charcoal">{fullName}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="brand">{ROLE_LABELS[profile.role]}</Badge>
                  {profile.buyer_type && <Badge variant="neutral">{BUYER_TYPE_LABELS[profile.buyer_type]}</Badge>}
                  {profile.is_verified && <Badge variant="success" dot>Vérifié</Badge>}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <input ref={fileRef} type="file" accept={ACCEPTED_IMAGE_TYPES.join(',')} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void onPickPhoto(e)} />
                  <Button type="button" variant="outline" size="sm" loading={uploading} onClick={() => fileRef.current?.click()}><Camera className="h-4 w-4" aria-hidden="true" /> Changer la photo</Button>
                  {avatarUrl && <Button type="button" variant="ghost" size="sm" onClick={() => setAvatarUrl('')}><Trash2 className="h-4 w-4" aria-hidden="true" /> Retirer</Button>}
                </div>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <form id="profil-form" onSubmit={handleSave} className="scroll-mt-24 space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Nom complet" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                <Input label="Téléphone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+243 ..." />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Select label="Province" value={province} onChange={(e) => setProvince(e.target.value)} placeholder="Sélectionner" options={PROVINCES.map((p) => ({ value: p, label: p }))} />
                <Input label="Ville" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <Textarea label="Bio / Présentation" rows={4} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Présentez votre activité, vos productions, votre expérience..." />
              <Button type="submit" loading={saving}><Save className="h-4 w-4" /> Enregistrer les modifications</Button>
            </form>
          </CardBody>
        </Card>

        {/* Passe 23 : disponibilité des commandes (producteurs / coopératives uniquement, le composant se masque sinon) */}
        <ProducerAvailabilityCard />

        <PrivacySettings />
      </div>
    </DashboardLayout>
  );
}
