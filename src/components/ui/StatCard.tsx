import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  trend?: { value: string; positive: boolean };
  accent?: 'brand' | 'amber' | 'blue' | 'emerald' | 'rose';
  className?: string;
}

const accents = {
  brand: 'bg-brand-50 text-brand-600',
  amber: 'bg-accent-50 text-accent-600',
  blue: 'bg-charcoal/5 text-charcoal',
  emerald: 'bg-brand-100 text-brand-700',
  rose: 'bg-rose-50 text-rose-600',
};

export function StatCard({ label, value, icon, trend, accent = 'brand', className }: StatCardProps) {
  return (
    <div className={cn('rounded-2xl border border-black/[0.06] bg-offwhite p-5 shadow-card', className)}>
      <div className="flex items-start justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-sm text-charcoal/50">{label}</p>
          <p className="break-words text-xl font-bold tabular-nums text-charcoal sm:text-2xl">{value}</p>
        </div>
        <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', accents[accent])}>
          {icon}
        </div>
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1.5">
          <span className={cn('text-xs font-medium', trend.positive ? 'text-emerald-600' : 'text-rose-600')}>
            {trend.positive ? '↑' : '↓'} {trend.value}
          </span>
          <span className="text-xs text-charcoal/35">vs mois dernier</span>
        </div>
      )}
    </div>
  );
}
