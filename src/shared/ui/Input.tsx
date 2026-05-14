import { type InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '@shared/lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

/**
 * Input component - Pure presentational
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="mb-1.5 block text-sm font-medium text-secondary-700 dark:text-secondary-300"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'flex h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm transition-colors',
            'placeholder:text-secondary-400',
            'focus:outline-none focus:ring-2 focus:ring-offset-0',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'dark:bg-secondary-900 dark:text-secondary-100',
            error
              ? 'border-error-500 focus:border-error-500 focus:ring-error-500'
              : 'border-secondary-300 focus:border-primary-500 focus:ring-primary-500 dark:border-secondary-600',
            className
          )}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${inputId}-error` : undefined}
          {...props}
        />
        {error && (
          <p
            id={`${inputId}-error`}
            className="mt-1.5 text-sm text-error-600 dark:text-error-400"
          >
            {error}
          </p>
        )}
        {helperText && !error && (
          <p className="mt-1.5 text-sm text-secondary-500 dark:text-secondary-400">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
