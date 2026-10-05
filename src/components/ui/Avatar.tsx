import { cn } from '@/lib/utils';
import { getInitials } from '@/lib/utils';

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizes = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
  xl: 'h-20 w-20 text-2xl',
};

export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={`Photo de ${name}`}
        loading="lazy"
        decoding="async"
        className={cn('rounded-full object-cover ring-2 ring-white', sizes[size], className)}
      />
    );
  }
  return (
    <div className={cn(
      'rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white font-semibold flex items-center justify-center ring-2 ring-white',
      sizes[size],
      className,
    )}>
      {getInitials(name)}
    </div>
  );
}
