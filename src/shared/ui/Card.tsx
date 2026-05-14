import { type ReactNode } from 'react';
import { cn } from '@shared/lib/utils';

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

/**
 * Card component - Pure presentational container
 */
export function Card({ children, className, padding = 'md' }: CardProps) {
  const paddingStyles = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
  };

  return (
    <div
      className={cn(
        'rounded-xl border border-secondary-200 bg-white shadow-sm',
        'dark:border-secondary-700 dark:bg-secondary-800',
        paddingStyles[padding],
        className
      )}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  children: ReactNode;
  className?: string;
}

export function CardHeader({ children, className }: CardHeaderProps) {
  return (
    <div
      className={cn(
        'border-b border-secondary-200 pb-4 dark:border-secondary-700',
        className
      )}
    >
      {children}
    </div>
  );
}

interface CardTitleProps {
  children: ReactNode;
  className?: string;
}

export function CardTitle({ children, className }: CardTitleProps) {
  return (
    <h3
      className={cn(
        'text-lg font-semibold text-secondary-900 dark:text-secondary-100',
        className
      )}
    >
      {children}
    </h3>
  );
}

interface CardContentProps {
  children: ReactNode;
  className?: string;
}

export function CardContent({ children, className }: CardContentProps) {
  return <div className={cn('pt-4', className)}>{children}</div>;
}

interface CardFooterProps {
  children: ReactNode;
  className?: string;
}

export function CardFooter({ children, className }: CardFooterProps) {
  return (
    <div
      className={cn(
        'border-t border-secondary-200 pt-4 dark:border-secondary-700',
        className
      )}
    >
      {children}
    </div>
  );
}
