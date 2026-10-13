import { forwardRef } from 'react';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const Spinner = forwardRef<HTMLDivElement, SpinnerProps>(
  ({ size = 'md', className = '' }, ref) => {
    const sizeClasses = {
      sm: 'h-4 w-4 border-2',
      md: 'h-8 w-8 border-2',
      lg: 'h-12 w-12 border-3',
    };

    return (
      <div
        ref={ref}
        className={`${sizeClasses[size]} border-slate-200 border-t-primary-600 rounded-full animate-spin ${className}`}
        role="status"
        aria-label="Loading"
      />
    );
  },
);

Spinner.displayName = 'Spinner';

export default Spinner;
