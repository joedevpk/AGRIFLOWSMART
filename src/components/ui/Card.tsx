import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export function Card({ children, className, hover, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-2xl border border-black/[0.06] dark:border-white/10 bg-offwhite dark:bg-white/[0.04] shadow-card',
        hover && 'transition-all duration-300 hover:shadow-card-hover hover:-translate-y-0.5 hover:border-brand-200 dark:hover:border-brand-700 cursor-pointer',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('p-5', className)}>{children}</div>;
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-5 pt-5 pb-0', className)}>{children}</div>;
}
