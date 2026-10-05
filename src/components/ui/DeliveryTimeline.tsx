import { Sprout, PackageCheck, Truck, MapPin, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OrderStatus } from '@/types';
import { formatDate } from '@/lib/constants';

const STAGES = [
  { key: 'producer', label: 'Producteur', icon: Sprout, statuses: ['pending', 'confirmed', 'preparing', 'ready', 'in_delivery', 'delivered', 'completed'] },
  { key: 'preparation', label: 'Préparation', icon: PackageCheck, statuses: ['preparing', 'ready', 'in_delivery', 'delivered', 'completed'] },
  { key: 'transport', label: 'Transport', icon: Truck, statuses: ['in_delivery', 'delivered', 'completed'] },
  { key: 'delivery', label: 'Livraison', icon: MapPin, statuses: ['delivered', 'completed'] },
  { key: 'buyer', label: 'Acheteur', icon: User, statuses: ['completed'] },
] as const;

interface DeliveryTimelineProps {
  status: OrderStatus;
  distanceKm?: number | null;
  estimatedDate?: string | null;
  destinationCity?: string | null;
  className?: string;
}

export function DeliveryTimeline({ status, distanceKm, estimatedDate, destinationCity, className }: DeliveryTimelineProps) {
  const activeIndex = STAGES.reduce((acc, stage, idx) => (stage.statuses.includes(status as never) ? idx : acc), 0);

  return (
    <div className={cn('', className)}>
      <div className="flex items-center">
        {STAGES.map((stage, idx) => {
          const Icon = stage.icon;
          const reached = idx <= activeIndex;
          const isLast = idx === STAGES.length - 1;
          return (
            <div key={stage.key} className={cn('flex items-center', !isLast && 'flex-1')}>
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                    reached ? 'bg-brand-600 border-brand-600 text-white' : 'bg-offwhite border-black/[0.08] text-charcoal/30',
                  )}
                >
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <span className={cn('text-[10.5px] font-medium text-center leading-tight', reached ? 'text-charcoal' : 'text-charcoal/35')}>
                  {stage.label}
                </span>
              </div>
              {!isLast && (
                <div className={cn('h-0.5 flex-1 mx-1.5 mb-4 rounded-full transition-colors', idx < activeIndex ? 'bg-brand-600' : 'bg-black/[0.08]')} />
              )}
            </div>
          );
        })}
      </div>

      {(distanceKm != null || estimatedDate || destinationCity) && (
        <div className="mt-5 grid grid-cols-3 gap-3 text-center">
          {distanceKm != null && (
            <div className="rounded-xl bg-offwhite border border-black/[0.06] px-3 py-2.5">
              <p className="text-sm font-semibold text-charcoal">{distanceKm} km</p>
              <p className="text-[11px] text-charcoal/45">Distance</p>
            </div>
          )}
          {estimatedDate && (
            <div className="rounded-xl bg-offwhite border border-black/[0.06] px-3 py-2.5">
              <p className="text-sm font-semibold text-charcoal">{formatDate(estimatedDate)}</p>
              <p className="text-[11px] text-charcoal/45">Date estimée</p>
            </div>
          )}
          {destinationCity && (
            <div className="rounded-xl bg-offwhite border border-black/[0.06] px-3 py-2.5">
              <p className="text-sm font-semibold text-charcoal truncate">{destinationCity}</p>
              <p className="text-[11px] text-charcoal/45">Destination</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
