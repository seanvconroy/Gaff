import type { NextConfig } from 'next';
import { configuredProviders, contentSecurityPolicy as policyFor } from './src/lib/csp';

const isProduction = process.env.NODE_ENV === 'production';
// UX-LS-11: read when the app is built and started; "off" unless set (see src/lib/env.ts).
const searchIndexing = process.env.SEARCH_INDEXING === 'on';

// Renter and landlord pages are reached through private links, so pages must
// never leak their URL to another site: no referrer, no framing, no indexing.
const securityHeaders = [
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

// The policy, with Google's and Apple's sign-in hosts in form-action once each is configured
// (BA-1, AU1), and Stripe Identity's once it is the ID provider (BA-6). Read when the app is
// built, so redeploy after setting a provider.
const contentSecurityPolicy = policyFor({
  ...configuredProviders(process.env),
  stripeIdentity: process.env.IDENTITY_PROVIDER === 'stripe',
});

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
    return [
      { source: '/:path*', headers },
      // UX-LS-11: a home's public page can be found by search engines, but only where the
      // deployment says so (SEARCH_INDEXING=on, set in production alone), so a test or preview
      // copy of Gaff is never indexed. It holds nothing about any person. The page itself says
      // noindex when the home has been let or isn't there.
      ...(searchIndexing
        ? [{ source: '/homes/:ref', headers: [{ key: 'X-Robots-Tag', value: 'index, follow' }] }]
        : []),
    ];
  },
};

export default nextConfig;
