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
        {label && (
          <Label htmlFor={inputId}>{label}</Label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all ${
            error ? 'border-red-500' : 'border-slate-300'
          } ${className}`}
          {...props}
        />
        {error && (
          <p className="mt-1 text-sm text-red-600">{error}</p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';

export default Input;
