import type { NextConfig } from 'next';

const isProduction = process.env.NODE_ENV === 'production';

// Renter and landlord pages are reached through private links, so pages must
// never leak their URL to another site: no referrer, no framing, no indexing.
const securityHeaders = [
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

// Fonts are self-hosted and no third-party scripts load, so 'self' covers everything.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const nextConfig: NextConfig = {
  // The Docker image runs the standalone server; `next start` (tests, local) doesn't need it.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ['graphile-worker', 'pg'],
  async headers() {
    const headers = isProduction
      ? [
          ...securityHeaders,
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ]
      : securityHeaders;
    return [{ source: '/:path*', headers }];
  },
};

export default nextConfig;
