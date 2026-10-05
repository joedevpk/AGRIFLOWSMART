import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button-styles';
import { cn } from '@/lib/utils';

interface CTAAction {
  label: string;
  to: string;
}

interface CTASectionProps {
  title: string;
  description?: string;
  primary: CTAAction;
  secondary?: CTAAction;
  className?: string;
}

const OUTLINE_ON_DARK =
  'inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-white/25 px-6 text-base font-medium text-white transition-colors hover:border-white/40 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 sm:w-auto';

/** Bandeau d'appel à l'action final (fond Forest Green), identique sur toutes les pages. */
export function CTASection({ title, description, primary, secondary, className }: CTASectionProps) {
  return (
    <section className={cn('bg-brand-900 text-white', className)}>
      <div className="mx-auto max-w-4xl px-4 py-14 text-center sm:px-6 sm:py-16 lg:px-8">
        <h2 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
        {description && <p className="mx-auto mt-3 max-w-2xl text-base text-white/75">{description}</p>}
        <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <Link to={primary.to} className={buttonStyles({ variant: 'sun', size: 'lg', className: 'font-semibold sm:w-auto' })}>
            {primary.label} <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </Link>
          {secondary && (
            <Link to={secondary.to} className={OUTLINE_ON_DARK}>
              {secondary.label}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
