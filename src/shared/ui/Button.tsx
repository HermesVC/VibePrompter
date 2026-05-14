import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@shared/lib/utils';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  fullWidth?: boolean;
}

/**
 * Button component - Pure presentational
 * NO business logic, just styling and event forwarding
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      fullWidth = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 rounded-lg';

    const variantStyles = {
      primary:
        'bg-primary-600 text-white hover:bg-primary-700 focus-visible:ring-primary-500',
      secondary:
        'bg-secondary-100 text-secondary-900 hover:bg-secondary-200 focus-visible:ring-secondary-500 dark:bg-secondary-800 dark:text-secondary-100 dark:hover:bg-secondary-700',
      outline:
        'border border-secondary-300 bg-transparent hover:bg-secondary-100 focus-visible:ring-secondary-500 dark:border-secondary-600 dark:hover:bg-secondary-800',
      ghost:
        'bg-transparent hover:bg-secondary-100 focus-visible:ring-secondary-500 dark:hover:bg-secondary-800',
      danger:
        'bg-error-600 text-white hover:bg-error-700 focus-visible:ring-error-500',
    };

    const sizeStyles = {
      sm: 'h-8 px-3 text-sm gap-1.5',
      md: 'h-10 px-4 text-sm gap-2',
      lg: 'h-12 px-6 text-base gap-2.5',
    };

    return (
      <button
        ref={ref}
        className={cn(
          baseStyles,
          variantStyles[variant],
          sizeStyles[size],
          fullWidth && 'w-full',
          className
        )}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && (
          <svg
            className="h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
