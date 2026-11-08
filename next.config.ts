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
  'map-and-place-data',
  'contact',
  'sitemap\\.xml',
  'robots\\.txt',
];
// The test copy (GAFF_ENV=staging) is never indexed, public pages included.
const testCopy = process.env.GAFF_ENV === 'staging';
const noIndex = {
  source: testCopy ? '/:path*' : `/:path((?!${publicPages.join('|')}).*)`,
  headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
};

// Fonts are self-hosted and no third-party scripts load, so 'self' covers everything, except
// listing photos (M43): they upload to, and load from, Supabase Storage when it's set.
const storageOrigin = process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).origin : '';

// M57, ADR-0027: the search pages load Google's map when MAP_PROVIDER is google, so they also
// allow the hosts Google's CSP guide lists for the Maps JavaScript API. Not its fonts: the map's
// buttons use the page's own. Every other page keeps the policy without Google.
const googleMaps = process.env.MAP_PROVIDER === 'google';
const google = 'https://*.googleapis.com https://*.gstatic.com *.google.com';

function contentSecurityPolicy(maps: boolean): string {
  const join = (...parts: string[]) => parts.filter(Boolean).join(' ');
  return [
    "default-src 'self'",
    maps
      ? join(
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
          google,
          'https://*.ggpht.com *.googleusercontent.com',
        )
      : "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    join("img-src 'self' data:", storageOrigin, maps ? `${google} *.googleusercontent.com` : ''),
    "font-src 'self'",
    join("connect-src 'self'", storageOrigin, maps ? `${google} data: blob:` : ''),
    ...(maps ? ['frame-src *.google.com', 'worker-src blob:'] : []),
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

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
          { key: 'Content-Security-Policy', value: contentSecurityPolicy(false) },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ]
      : securityHeaders;
    // The later rule wins for the same header, so the search pages get the map's policy.
    const searchPages =
      isProduction && googleMaps
        ? [
            {
              source: '/to-rent/:path*',
              headers: [{ key: 'Content-Security-Policy', value: contentSecurityPolicy(true) }],
            },
          ]
        : [];
    return [{ source: '/:path*', headers }, ...searchPages, noIndex];
  },
};

export default nextConfig;
