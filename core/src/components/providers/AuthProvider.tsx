'use client';
import { SessionProvider } from 'next-auth/react';
import { AUTH_DISABLED } from '@/lib/authMode';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Local/desktop: no SessionProvider → no /api/auth/session polling (the
  // CLIENT_FETCH_ERROR) and useSession is never called (see page.tsx).
  if (AUTH_DISABLED) return <>{children}</>;
  return <SessionProvider>{children}</SessionProvider>;
}
