'use client';

import { useState, useCallback, createContext, useContext } from 'react';

type ToastType = 'error' | 'success' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let _globalId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'error') => {
    const id = ++_globalId;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div style={{
        position: 'fixed', top: 16, right: 16, zIndex: 400,
        display: 'flex', flexDirection: 'column', gap: 8,
        pointerEvents: 'none',
      }}>
        {toasts.map(t => {
          const colors = {
            error: { bg: '#ef444418', border: '#ef444440', text: '#ef4444' },
            success: { bg: '#22c55e18', border: '#22c55e40', text: '#22c55e' },
            info: { bg: 'var(--accent-dim)', border: 'rgba(var(--accent-r),0.3)', text: 'var(--accent)' },
          };
          const c = colors[t.type];
          return (
            <div
              key={t.id}
              style={{
                padding: '12px 18px',
                background: c.bg,
                border: `1px solid ${c.border}`,
                borderRadius: 8,
                backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                fontSize: 12,
                color: c.text,
                fontFamily: 'var(--font-inter)',
                lineHeight: 1.5,
                maxWidth: 360,
                pointerEvents: 'auto',
                animation: 'toast-in 0.25s ease',
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
              }}
            >
              {t.message}
            </div>
          );
        })}
      </div>
      <style>{`@keyframes toast-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </ToastContext.Provider>
  );
}
