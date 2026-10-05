import { CloudSun, Satellite, Layers, UserRound } from 'lucide-react';
import { Card, CardBody, Badge } from '@/components/ui';
import { ZONES_SOURCE } from '@/lib/agri/zones';

/** Distingue toujours l'origine des données : jamais de mélange ni de fausse précision. */
export function DataSourcesPanel({ zoneKnown, soilKnown, waterKnown }: { zoneKnown: boolean; soilKnown: boolean; waterKnown: boolean }) {
  const rows = [
    { icon: CloudSun, title: 'Données climatiques', ok: zoneKnown, text: zoneKnown ? ZONES_SOURCE : 'Choisissez une zone pour disposer de la référence climatique.' },
    { icon: Satellite, title: 'Données satellitaires', ok: false, text: 'Non connectées : aucune image satellite n\'est utilisée. Le pH ou la fertilité d\'un sol ne peuvent pas être mesurés depuis une carte ou une image.' },
    { icon: Layers, title: 'Données pédologiques', ok: false, text: 'Non connectées : aucune base de sols n\'est interrogée. Seule une analyse de sol fiable permet de connaître le pH.' },
    { icon: UserRound, title: 'Données fournies par l\'agriculteur', ok: soilKnown || waterKnown, text: `Type de sol / pH : ${soilKnown ? 'renseigné' : 'non renseigné'} · Eau : ${waterKnown ? 'renseignée' : 'non renseignée'}.` },
  ];
  return (
    <Card><CardBody>
      <h3 className="mb-3 font-semibold text-charcoal">Source des données</h3>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.title} className="flex gap-3 text-sm">
            <r.icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
            <div>
              <p className="flex flex-wrap items-center gap-2 font-medium text-charcoal">{r.title} <Badge variant={r.ok ? 'success' : 'neutral'}>{r.ok ? 'Utilisées' : 'Non disponibles'}</Badge></p>
              <p className="text-xs text-charcoal/55">{r.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </CardBody></Card>
  );
}
