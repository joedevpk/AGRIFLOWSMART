import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'harvest' | 'sun';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

export const buttonVariantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 active:scale-[0.98] shadow-sm shadow-brand-600/20',
  secondary: 'bg-brand-50 text-brand-700 hover:bg-brand-100 border border-brand-200',
  outline: 'border border-brand-200 dark:border-white/15 text-charcoal/80 dark:text-cream/80 hover:bg-cream dark:hover:bg-white/5 hover:border-brand-300',
  ghost: 'text-charcoal/70 dark:text-cream/70 hover:bg-cream dark:hover:bg-white/5 hover:text-charcoal dark:hover:text-cream',
  harvest: 'bg-accent-50 text-accent-700 border border-accent-300 hover:bg-accent-100 hover:border-accent-400',
  sun: 'bg-accent-400 text-brand-950 border border-accent-400 hover:bg-accent-300 hover:border-accent-300 active:scale-[0.98] shadow-sm shadow-accent-400/25',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800 shadow-sm shadow-rose-600/20',
};

export const buttonSizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-[36px] [@media(pointer:coarse)]:min-h-[44px] px-3 py-1.5 text-sm rounded-lg gap-1.5',
  md: 'min-h-[44px] px-4 py-2.5 text-sm rounded-xl gap-2',
  lg: 'min-h-[48px] px-6 py-3 text-base rounded-xl gap-2',
  xl: 'min-h-[56px] px-8 py-4 text-lg rounded-xl gap-2.5',
};

/** Classes de bouton réutilisables pour des <Link> ou <span> qui doivent ressembler à un Button. */
export function buttonStyles({ variant = 'primary', size = 'md', fullWidth, className }: { variant?: ButtonVariant; size?: ButtonSize; fullWidth?: boolean; className?: string } = {}): string {
  return cn(
    'inline-flex items-center justify-center whitespace-nowrap text-center font-medium leading-tight transition-all duration-200 [&>svg]:shrink-0',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
    buttonVariantClasses[variant],
    buttonSizeClasses[size],
    fullWidth && 'w-full',
    className,
  );
}
