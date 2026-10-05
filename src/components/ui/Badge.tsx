import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'brand' | 'neutral';

const variants: Record<BadgeVariant, string> = {
  default: 'bg-cream text-charcoal/80 border-brand-200',
  success: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-100 text-amber-700 border-amber-200',
  error: 'bg-rose-100 text-rose-700 border-rose-200',
  info: 'bg-blue-100 text-blue-700 border-blue-200',
  brand: 'bg-brand-100 text-brand-700 border-brand-200',
  neutral: 'bg-cream text-charcoal/70 border-brand-200',
};

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
  dot?: boolean;
}

export function Badge({ children, variant = 'default', className, dot }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
      variants[variant],
      className,
    )}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
