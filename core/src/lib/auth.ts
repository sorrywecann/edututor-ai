import NextAuth from 'next-auth/next';
import CredentialsProvider from 'next-auth/providers/credentials';

// V2 prototype: single demo user. Replace with DB lookup in production.
// Default password matches the on-screen hint at /auth/signin so the
// advertised demo credentials work without extra .env configuration.
const DEMO_USER = {
  id: '1',
  name: 'Learner',
  email: 'demo@edututor.sk',
  password: process.env.DEMO_PASSWORD || 'edututor2026',
};

// When NEXTAUTH_URL is not https://..., next-auth disables the Secure cookie
// flag automatically. We still pin explicit cookie names + SameSite=Lax so
// that local-dev (http://localhost:3000) and Docker production builds both
// produce predictable, browser-storable session cookies. The previous default
// behaviour was correct on HTTP only by coincidence — making it explicit
// prevents the "logged in then logged out on click" symptom that appears when
// browsers silently drop Secure cookies served over HTTP.
const useSecureCookies =
  (process.env.NEXTAUTH_URL || '').startsWith('https://');
const cookiePrefix = useSecureCookies ? '__Secure-' : '';

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        if (credentials.email !== DEMO_USER.email) return null;
        if (credentials.password !== DEMO_USER.password) return null;
        return { id: DEMO_USER.id, name: DEMO_USER.name, email: DEMO_USER.email };
      },
    }),
  ],
  pages: { signIn: '/auth/signin' },
  session: { strategy: 'jwt' as const },
  // Pin cookie config so HTTP-local and HTTPS-production both work
  // deterministically without relying on next-auth heuristics.
  useSecureCookies,
  cookies: {
    sessionToken: {
      name: `${cookiePrefix}next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax' as const,
        path: '/',
        secure: useSecureCookies,
      },
    },
  },
  secret: process.env.NEXTAUTH_SECRET || (process.env.NODE_ENV === 'production' ? (() => { throw new Error('NEXTAUTH_SECRET must be set in production'); })() : 'edututor-dev-secret-local'),
  // Treat JWT decryption failures (e.g. stale cookies from a previous build
  // signed with a different NEXTAUTH_SECRET) as silently expired sessions
  // instead of as 500-level server errors. Without this, users with old
  // cookies see redirect loops to /auth/signin and noisy server logs.
  logger: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    error(code: string, metadata: any) {
      if (code === 'JWT_SESSION_ERROR') {
        // Stale / mis-encrypted cookie — next-auth will clear it on the next
        // response. Silent (no console noise) and the client just sees an
        // unauthenticated session, prompting a clean re-login.
        return;
      }
      // eslint-disable-next-line no-console
      console.error(`[next-auth][error][${code}]`, metadata);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    warn(code: string) {
      // eslint-disable-next-line no-console
      console.warn(`[next-auth][warn][${code}]`);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    debug(_code: string, _metadata: any) {
      // no-op in production
    },
  },
  callbacks: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jwt({ token, user }: { token: any; user?: any }) {
      if (user) token.id = user.id;
      return token;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    session({ session, token }: { session: any; token: any }) {
      if (session.user) session.user.id = token.id;
      return session;
    },
  },
};

export default NextAuth(authOptions);
