import { ButtonHTMLAttributes, forwardRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', isLoading, children, className = '', disabled, ...props }, ref) => {
    const baseClasses =
      'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed';

    const variantClasses = {
      primary: 'bg-slate-900 text-white shadow-sm hover:bg-slate-700 active:bg-slate-800',
      secondary: 'border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300 active:bg-slate-100',
      danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-700 focus-visible:ring-red-500/20',
      ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
    };

    const sizeClasses = {
      sm: 'h-8 px-3 text-[13px] gap-1.5',
      md: 'h-9 px-3.5 text-[13px] gap-2',
      lg: 'h-10 px-5 text-[13px] gap-2',
    };

    return (
      <button
        ref={ref}
        className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60" />
        )}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';

export default Button;
