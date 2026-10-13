import { LabelHTMLAttributes, forwardRef } from 'react';

interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  children: React.ReactNode;
}

const Label = forwardRef<HTMLLabelElement, LabelProps>(
  ({ children, className = '', ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={`block text-sm font-medium text-slate-700 mb-1 ${className}`}
        {...props}
      >
        {children}
      </label>
    );
  },
);

Label.displayName = 'Label';

export { Label };
