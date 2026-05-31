'use client';

import { useState, useEffect, useCallback } from 'react';
import { Sidebar } from '@/components/shell/Sidebar';
import { ChamberSidebar } from '@/components/shell/ChamberSidebar';
import { UnifiedOnboarding } from '@/components/shell/UnifiedOnboarding';
import { ToastProvider } from '@/components/ui/Toast';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useDesignVariant } from '@/lib/designVariant';

function useIsMobile(breakpoint = 768) {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    setMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);
  return mobile;
}

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  const mobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const { variant } = useDesignVariant();

  return (
    <ToastProvider>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        {mobile && (
          <button
            onClick={() => setSidebarOpen(true)}
            style={{
              position: 'fixed', top: '12px', left: '12px', zIndex: 100,
              width: '36px', height: '36px', borderRadius: '8px',
              background: 'var(--surface)', border: '1px solid var(--border)',
              color: 'var(--t1)', fontSize: '16px', cursor: 'pointer',
              display: sidebarOpen ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ☰
          </button>
        )}

        {mobile && sidebarOpen && (
          <div
            onClick={closeSidebar}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
              zIndex: 199, backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
            }}
          />
        )}

        {(!mobile || sidebarOpen) && (
          <div style={mobile ? { position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 200 } : {}}>
            <ErrorBoundary scope="shell.sidebar">
              {variant === 'chamber'
                ? <ChamberSidebar />
                : <Sidebar systemOnline={true} onClose={mobile ? closeSidebar : undefined} />}
            </ErrorBoundary>
          </div>
        )}

        <main
          className="atm-hero"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <ErrorBoundary scope="shell.main">{children}</ErrorBoundary>
        </main>
        <ErrorBoundary scope="shell.onboarding"><UnifiedOnboarding /></ErrorBoundary>
      </div>
    </ToastProvider>
  );
}
