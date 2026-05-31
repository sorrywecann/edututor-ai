/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // ESLint runs in CI; don't block `next build` on lint warnings here.
  // (Strict lint surfaces a lot of noise from generated/third-party d.ts files;
  // tsc still runs as part of build for real type errors.)
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Root the standalone trace at core/ (not the repo) so the output isn't nested
  // and hoisted node_modules (styled-jsx etc.) are all included for bundling.
  outputFileTracingRoot: __dirname,
  async rewrites() {
    // API_PROXY_TARGET is a server-only build arg (no NEXT_PUBLIC_ prefix).
    // NEXT_PUBLIC_API_URL stays empty so browser uses relative URLs.
    const apiUrl = process.env.API_PROXY_TARGET || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiUrl}/api/v1/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
