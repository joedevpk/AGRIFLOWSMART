import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-6 text-center', className)}>
      {icon && (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-cream text-charcoal/40">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-charcoal">{title}</h3>
      {description && <p className="mt-1.5 text-sm text-charcoal/60 max-w-sm">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorState({ title = 'Une erreur est survenue', message, onRetry, retryLabel = 'Réessayer' }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-400">
        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-charcoal">{title}</h3>
      <p className="mt-1.5 text-sm text-charcoal/60 max-w-sm">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-6 inline-flex items-center gap-2 rounded-lg border border-brand-200 px-4 py-2 text-sm font-medium text-charcoal/80 hover:bg-cream transition-colors">
          {retryLabel}
        </button>
      )}
    </div>
  );
}

export function LoadingState({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <svg className="animate-spin h-8 w-8 text-brand-500" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <p className="mt-3 text-sm text-charcoal/60">{label}</p>
    </div>
  );
}
