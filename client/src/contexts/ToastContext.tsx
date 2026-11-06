import { createContext, useContext, ReactNode } from 'react';
import toast, { Toaster, ToastPosition } from 'react-hot-toast';

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  promise: <T>(
    promise: Promise<T>,
    messages: { loading: string; success: string; error: string },
  ) => Promise<T>;
}

const ToastContext = createContext<ToastContextValue>({
  success: () => {},
  error: () => {},
  promise: () => Promise.resolve({} as any),
});

export function ToastProvider({ children }: { children: ReactNode }) {
  const success = (message: string) => toast.success(message);
  const error = (message: string) => toast.error(message);
  const promise: ToastContextValue['promise'] = (promise, messages) =>
    toast.promise(promise, messages, { position: 'top-right' as ToastPosition });

  return (
    <ToastContext.Provider value={{ success, error, promise }}>
      {children}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#0f172a',
            color: '#f8fafc',
            borderRadius: '10px',
            padding: '10px 14px',
            fontSize: '13px',
            fontWeight: '500',
            boxShadow: '0 12px 32px -8px rgba(15,23,42,0.35)',
            border: '1px solid rgba(148,163,184,0.14)',
          },
          success: { iconTheme: { primary: '#34d399', secondary: '#f8fafc' } },
          error: { iconTheme: { primary: '#f87171', secondary: '#f8fafc' } },
        }}
      />
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
