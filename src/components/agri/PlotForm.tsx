import { useState } from 'react';
import { LocateFixed, ExternalLink } from 'lucide-react';
import { Input, Select, Textarea, Button } from '@/components/ui';
import { toast } from '@/components/ui/toast-store';
import { CROPS, SOIL_LABELS, type SoilType } from '@/lib/agri/crops';
import { ZONES } from '@/lib/agri/zones';
import { WATER_LABELS, type WaterAccess } from '@/lib/agri/suitability';
import { AREA_UNIT_LABELS, PLOT_STATUS_LABELS, type AreaUnit, type Plot, type PlotStatus } from '@/types/agri';
import { UNITS, UNIT_LABELS } from '@/lib/constants';
import { newPlotId } from '@/services/agriService';

const opts = <T extends string>(rec: Record<T, string>) => (Object.keys(rec) as T[]).map((v) => ({ value: v, label: rec[v] }));
const cropOptions = CROPS.map((c) => ({ value: c.id, label: `${c.emoji} ${c.name}` }));

interface Props { userId: string; initial?: Plot; onSave: (plot: Plot, isNew: boolean) => void; onCancel: () => void }

export function PlotForm({ userId, initial, onSave, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [zoneId, setZoneId] = useState(initial?.zone_id ?? '');
  const [locality, setLocality] = useState(initial?.locality ?? '');
  const [lat, setLat] = useState(initial?.latitude?.toString() ?? '');
  const [lng, setLng] = useState(initial?.longitude?.toString() ?? '');
  const [area, setArea] = useState(initial?.area_value?.toString() ?? '');
  const [areaUnit, setAreaUnit] = useState<AreaUnit>(initial?.area_unit ?? 'm2');
  const [currentCrop, setCurrentCrop] = useState(initial?.current_crop ?? '');
  const [plannedCrop, setPlannedCrop] = useState(initial?.planned_crop ?? '');
  const [startDate, setStartDate] = useState(initial?.start_date ?? '');
  const [status, setStatus] = useState<PlotStatus>(initial?.status ?? 'planned');
  const [water, setWater] = useState<WaterAccess>(initial?.water_access ?? 'inconnu');
  const [soilType, setSoilType] = useState<SoilType | ''>(initial?.soil_type ?? '');
  const [soilPh, setSoilPh] = useState(initial?.soil_ph?.toString() ?? '');
  const [qty, setQty] = useState(initial?.planned_quantity?.toString() ?? '');
  const [qtyUnit, setQtyUnit] = useState(initial?.planned_unit ?? 'kg');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [locating, setLocating] = useState(false);

  const locate = () => {
    if (!('geolocation' in navigator)) { toast('error', 'La localisation n\'est pas disponible sur cet appareil. Saisissez la zone à la main.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLat(pos.coords.latitude.toFixed(6)); setLng(pos.coords.longitude.toFixed(6)); setLocating(false); toast('success', 'Position enregistrée sur cet appareil.'); },
      () => { setLocating(false); toast('error', 'Position introuvable. Vous pouvez saisir la zone manuellement.'); },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
    );
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!name.trim()) err.name = 'Donnez un nom à la parcelle.';
    const areaN = Number(area);
    if (!area || !(areaN > 0)) err.area = 'Indiquez une superficie supérieure à 0.';
    if (soilPh !== '' && (Number(soilPh) < 3 || Number(soilPh) > 10)) err.ph = 'Le pH doit être compris entre 3 et 10.';
    if ((lat !== '' || lng !== '') && (lat === '' || lng === '' || Math.abs(Number(lat)) > 90 || Math.abs(Number(lng)) > 180)) err.geo = 'Coordonnées invalides (latitude −90 à 90, longitude −180 à 180).';
    if (qty !== '' && Number(qty) < 0) err.qty = 'La quantité doit être positive.';
    setErrors(err);
    if (Object.keys(err).length) return;
    const now = new Date().toISOString();
    onSave({
      id: initial?.id ?? newPlotId(), user_id: userId, name: name.trim(), zone_id: zoneId || null, locality: locality.trim() || null,
      latitude: lat === '' ? null : Number(lat), longitude: lng === '' ? null : Number(lng),
      area_value: areaN, area_unit: areaUnit, current_crop: currentCrop || null, planned_crop: plannedCrop || null,
      start_date: startDate || null, status, water_access: water, soil_type: soilType || null, soil_ph: soilPh === '' ? null : Number(soilPh),
      planned_quantity: qty === '' ? null : Number(qty), planned_unit: qtyUnit, notes: notes.trim() || null,
      version: initial?.version ?? 1, created_at: initial?.created_at ?? now, updated_at: now,
    }, !initial);
  };

  const hasGeo = lat !== '' && lng !== '' && !errors.geo;
  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Nom de la parcelle" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} maxLength={80} placeholder="Ex. Parcelle du bas-fond" />
        <Select label="Zone de référence" value={zoneId} onChange={(e) => setZoneId(e.target.value)} placeholder="Choisir la zone la plus proche" options={ZONES.map((z) => ({ value: z.id, label: `${z.name} (${z.region})` }))} />
        <Input label="Localité (saisie manuelle)" value={locality} onChange={(e) => setLocality(e.target.value)} maxLength={120} hint="Village, quartier, groupement… si la localisation précise n'est pas disponible." />
        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <Input label="Superficie" type="number" inputMode="decimal" min="0" step="any" value={area} onChange={(e) => setArea(e.target.value)} error={errors.area} />
          <Select label="Unité" aria-label="Unité de superficie" value={areaUnit} onChange={(e) => setAreaUnit(e.target.value as AreaUnit)} options={opts(AREA_UNIT_LABELS)} />
        </div>
      </div>

      <fieldset className="space-y-3 rounded-2xl border border-black/[0.06] bg-sage/30 p-4">
        <legend className="px-1 text-sm font-semibold text-charcoal">Coordonnées (facultatif)</legend>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Input label="Latitude" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-4.325" />
          <Input label="Longitude" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="15.322" />
          <Button type="button" variant="outline" onClick={locate} loading={locating}><LocateFixed className="h-4 w-4" /> Ma position</Button>
        </div>
        {errors.geo && <p className="text-xs text-rose-600">{errors.geo}</p>}
        <p className="text-xs text-charcoal/55">La position est lue par votre appareil (GPS) et fonctionne sans internet. Aucune carte n'est chargée dans l'application.{hasGeo && <> <a className="inline-flex items-center gap-1 font-medium text-brand-700 underline" href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`} target="_blank" rel="noopener noreferrer">Voir sur OpenStreetMap <ExternalLink className="h-3 w-3" /></a></>}</p>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Culture actuelle" value={currentCrop} onChange={(e) => setCurrentCrop(e.target.value)} placeholder="Aucune" options={cropOptions} />
        <Select label="Culture envisagée" value={plannedCrop} onChange={(e) => setPlannedCrop(e.target.value)} placeholder="Pas encore choisie" options={cropOptions} />
        <Input label="Date de début" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <Select label="Statut" value={status} onChange={(e) => setStatus(e.target.value as PlotStatus)} options={opts(PLOT_STATUS_LABELS)} />
      </div>

      <fieldset className="space-y-3 rounded-2xl border border-black/[0.06] p-4">
        <legend className="px-1 text-sm font-semibold text-charcoal">Ce que vous savez de votre terrain (facultatif)</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Select label="Type de sol" value={soilType} onChange={(e) => setSoilType(e.target.value as SoilType | '')} placeholder="Je ne sais pas" options={opts(SOIL_LABELS)} />
          <Input label="pH du sol" type="number" inputMode="decimal" step="0.1" min="3" max="10" value={soilPh} onChange={(e) => setSoilPh(e.target.value)} error={errors.ph} hint="Seulement si mesuré (analyse de sol)." />
          <Select label="Eau disponible" value={water} onChange={(e) => setWater(e.target.value as WaterAccess)} options={opts(WATER_LABELS)} />
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-2xl border border-black/[0.06] p-4">
        <legend className="px-1 text-sm font-semibold text-charcoal">Production prévue (pour la vendre ensuite)</legend>
        <div className="grid grid-cols-[1fr_auto] items-end gap-3 sm:max-w-md">
          <Input label="Quantité prévue" type="number" inputMode="decimal" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} error={errors.qty} placeholder="Ex. 500" />
          <Select label="Unité" aria-label="Unité de quantité" value={qtyUnit} onChange={(e) => setQtyUnit(e.target.value)} options={UNITS.map((u) => ({ value: u, label: UNIT_LABELS[u] ?? u }))} />
        </div>
      </fieldset>

      <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={2000} />

      <div className="flex flex-wrap justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onCancel}>Annuler</Button>
        <Button type="submit">Enregistrer la parcelle</Button>
      </div>
    </form>
  );
}
