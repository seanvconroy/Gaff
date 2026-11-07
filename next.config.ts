import type { NextConfig } from 'next';

const isProduction = process.env.NODE_ENV === 'production';

// Renter and landlord pages are reached through private links, so pages must
// never leak their URL to another site: no referrer, no framing, no indexing.
const securityHeaders = [
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

// M111: the marketplace's public pages are for search engines too. Everything else, including
// every private link, is never indexed.
const publicPages = [
  'to-rent',
  'home/',
  'development/',
  'how-results-are-ordered',
  'listing-policy',
  'contact',
  'sitemap\\.xml',
  'robots\\.txt',
];
const noIndex = {
  source: `/:path((?!${publicPages.join('|')}).*)`,
  headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
};

// Fonts are self-hosted and no third-party scripts load, so 'self' covers everything, except
// listing photos (M43): they upload to, and load from, Supabase Storage when it's set.
const storageOrigin = process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).origin : '';
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: ${storageOrigin}`.trim(),
  "font-src 'self'",
  `connect-src 'self' ${storageOrigin}`.trim(),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ['graphile-worker', 'pg'],
  // R25: inventory photos are uploaded through a server action, each under 4 MB, inside
  // Vercel's 4.5 MB limit for a whole request (ADR-0014).
  experimental: { serverActions: { bodySizeLimit: '4.5mb' } },
  async headers() {
    const headers = isProduction
      ? [
          ...securityHeaders,
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ]
      : securityHeaders;
    return [{ source: '/:path*', headers }, noIndex];
  },
};

export default nextConfig;
