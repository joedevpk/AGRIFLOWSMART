import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const baseField = 'w-full rounded-xl border border-black/[0.08] bg-offwhite px-4 py-2.5 text-sm text-charcoal placeholder:text-charcoal/35 transition-all duration-200 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 disabled:bg-sage/40 disabled:text-charcoal/40';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-charcoal/70">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(baseField, error && 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/10', className)}
          {...props}
        />
        {error ? (
          <p className="text-xs text-rose-600">{error}</p>
        ) : hint ? (
          <p className="text-xs text-charcoal/35">{hint}</p>
        ) : null}
      </div>
    );
  },
);
Input.displayName = 'Input';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, placeholder, className, id, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={selectId} className="block text-sm font-medium text-charcoal/70">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={cn(baseField, 'appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20fill=%27none%27%20viewBox=%270%200%2024%2024%27%20stroke=%27%239ca3af%27%20stroke-width=%272%27%3E%3Cpath%20d=%27M6%209l6%206%206-6%27/%3E%3C/svg%3E")] bg-[length:1.25rem] bg-[right_0.75rem_center] bg-no-repeat pr-10', error && 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/10', className)}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {error && <p className="text-xs text-rose-600">{error}</p>}
      </div>
    );
  },
);
Select.displayName = 'Select';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={textareaId} className="block text-sm font-medium text-charcoal/70">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(baseField, 'resize-none', error && 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/10', className)}
          {...props}
        />
        {error ? (
          <p className="text-xs text-rose-600">{error}</p>
        ) : hint ? (
          <p className="text-xs text-charcoal/35">{hint}</p>
        ) : null}
      </div>
    );
  },
);
Textarea.displayName = 'Textarea';
