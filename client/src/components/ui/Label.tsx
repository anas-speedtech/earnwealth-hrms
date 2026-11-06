import { LabelHTMLAttributes, forwardRef } from 'react';

interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  children: React.ReactNode;
}

const Label = forwardRef<HTMLLabelElement, LabelProps>(
  ({ children, className = '', ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={`mb-1.5 block text-[12px] font-medium text-slate-600 ${className}`}
        {...props}
      >
        {children}
      </label>
    );
  },
);

Label.displayName = 'Label';

export { Label };
