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
            background: '#1e293b',
            color: '#f8fafc',
            borderRadius: '8px',
            padding: '12px 16px',
            fontSize: '14px',
          },
          success: { iconTheme: { primary: '#22c55e', secondary: '#f8fafc' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#f8fafc' } },
        }}
      />
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
