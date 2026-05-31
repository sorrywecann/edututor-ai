import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth } from 'next-auth/middleware';

const skipAuth = process.env.NEXT_PUBLIC_SKIP_AUTH === 'true' || process.env.NODE_ENV === 'development';

const authMiddleware = withAuth({
  pages: { signIn: '/auth/signin' },
});

export default function middleware(req: NextRequest) {
  if (skipAuth) return NextResponse.next();
  return (authMiddleware as unknown as (req: NextRequest) => NextResponse)(req);
}

export const config = {
  matcher: ['/knowledge', '/progress'],
};
