import { createContext, useContext, ReactNode, useState, useCallback } from 'react';
import './Toast.css';
import { Tone } from './StatusChip';

interface Toast {
  id: string;
  message: string;
  tone: Tone;
}

interface ToastContextType {
  show(message: string, tone?: Tone): void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, tone: Tone = 'info') => {
    const id = Math.random().toString();
    setToasts(prev => [...prev, { id, message, tone }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="toast-container" role="region" aria-live="polite" aria-label="Notifications">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast toast-${toast.tone}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
