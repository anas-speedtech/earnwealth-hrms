import { forwardRef } from 'react';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, id, className = '', ...props }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s/g, '-');

    return (
      <div className="w-full">
        {label && <label htmlFor={textareaId} className="block text-sm font-medium text-slate-700 mb-1">{label}</label>}
        <textarea
          ref={ref}
          id={textareaId}
          className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all resize-y ${
            error ? 'border-red-500' : 'border-slate-300'
          } ${className}`}
          rows={4}
          {...props}
        />
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </div>
    );
  },
);

Textarea.displayName = 'Textarea';

export default Textarea;
