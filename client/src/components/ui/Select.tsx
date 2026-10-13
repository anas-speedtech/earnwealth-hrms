import { SelectHTMLAttributes, forwardRef } from 'react';
import { Label } from './Label';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, placeholder, id, className = '', ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s/g, '-');

    return (
      <div className="w-full">
        {label && <Label htmlFor={selectId}>{label}</Label>}
        <select
          ref={ref}
          id={selectId}
          className={`w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none bg-white ${className}`}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    );
  },
);

Select.displayName = 'Select';

export default Select;
