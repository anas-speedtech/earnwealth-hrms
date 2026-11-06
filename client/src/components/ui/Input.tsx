import { InputHTMLAttributes, forwardRef } from 'react';
import { Label } from './Label';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, id, className = '', ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s/g, '-');

    return (
      <div className="w-full">
        {label && <Label htmlFor={inputId}>{label}</Label>}
        <input
          ref={ref}
          id={inputId}
          className={`h-9 w-full rounded-lg border bg-white px-3.5 text-[13px] text-slate-900 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 ${
            error ? 'border-red-400 focus:border-red-500 focus:ring-red-500/10' : 'border-slate-200'
          } ${className}`}
          {...props}
        />
        {error && (
          <p className="mt-1 text-xs text-red-600">{error}</p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';

export default Input;
