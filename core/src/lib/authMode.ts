// Whether client-side auth (next-auth) is bypassed.
//
// The desktop app and local dev are single-user, so we skip the SessionProvider
// network fetch (/api/auth/session) and the sign-in gate entirely — otherwise
// the app shows a LoginPage and spams CLIENT_FETCH_ERROR offline. The
// cloud/multi-tenant build leaves NEXT_PUBLIC_SKIP_AUTH unset to keep auth on.
//
// Mirrors the same flag used server-side by middleware.ts.
export const AUTH_DISABLED =
  process.env.NEXT_PUBLIC_SKIP_AUTH === 'true' ||
  process.env.NODE_ENV === 'development';
