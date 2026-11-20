import type { NextConfig } from 'next';
import {
  configuredProviders,
  googleMapsBuild,
  contentSecurityPolicy as policyFor,
  photoUploadOrigin,
} from './src/lib/csp';
import { mapPageSources } from './src/lib/map-pages';

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
// (BA-1, AU1), Stripe Identity's once it is the ID provider (BA-6), and the photo store's origin
// in connect-src where photos go straight to it (M43). Read when the app is built, so redeploy
// after setting a provider or the photo store.
const providers = {
  ...configuredProviders(process.env),
  stripeIdentity: process.env.IDENTITY_PROVIDER === 'stripe',
};
const photoUploads = photoUploadOrigin(process.env);
const contentSecurityPolicy = policyFor(providers, { photoUploads });

// BA-5, M119 (the live line's ADR-0028): the pages that show Google's map (Search, and "Where is
// it on the map?") allow Google's hosts, and only in a build whose map is Google's. Every page,
// these included, keeps `Referrer-Policy: no-referrer`: Google's script is told the site's origin
// alone (auth_referrer_policy=origin, src/ui/GoogleLoader.tsx). A policy comes with its document,
// so going between these pages and any other is a full page load (src/ui/MapBoundary.tsx).
const googleMaps = googleMapsBuild(process.env);
const mapPolicy = policyFor(providers, { maps: true, photoUploads });

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ['graphile-worker', 'pg'],
  // R25: inventory photos are uploaded through a server action, each under 4 MB, inside
  // Vercel's 4.5 MB limit for a whole request (ADR-0014). So are homes' photos with the local
  // store; with Supabase Storage they go straight to it (M43, ADR-0023).
  experimental: { serverActions: { bodySizeLimit: '4.5mb' } },
  // Built into the pages' scripts, so they know which policy this build's documents carry.
  env: { NEXT_PUBLIC_GOOGLE_MAP_PAGES: googleMaps ? '1' : '' },
  async headers() {
    const headers = isProduction
      ? [
          ...securityHeaders,
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ]
      : securityHeaders;
    // The later rule wins for the same header, so the map's pages get the map's policy.
    const withMap =
      isProduction && googleMaps
        ? mapPageSources.map((source) => ({
            source,
            headers: [{ key: 'Content-Security-Policy', value: mapPolicy }],
          }))
        : [];
    return [
      { source: '/:path*', headers },
      ...withMap,
      // UX-LS-11: a home's public page can be found by search engines, but only where the
      // deployment says so (SEARCH_INDEXING=on, set in production alone), so a test or preview
      // copy of Gaff is never indexed. It holds nothing about any person. The page itself says
      // noindex when the home has been let or isn't there.
      // M111 (BA-12): so can the pages of places, `/to-rent/…`. A place's page with no home on
      // Gaff still says noindex in the page itself, and the more restrictive rule wins.
      ...(searchIndexing
        ? ['/homes/:ref', '/to-rent/:path*'].map((source) => ({
            source,
            headers: [{ key: 'X-Robots-Tag', value: 'index, follow' }],
          }))
        : []),
    ];
  },
};

export default nextConfig;
