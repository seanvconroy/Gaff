/**
 * The Content Security Policy (next.config.ts). Fonts are self-hosted and no third-party
 * scripts load, so 'self' covers everything, except where a form's answer goes, and Google's
 * map on the pages that show it (BA-5).
 *
 * BA-1, AU1: "Continue with Google" and "Continue with Apple" are forms whose answer sends the
 * browser on to the provider, and browsers apply form-action to where a form's answer
 * redirects, not just to where it posts. So each provider's sign-in host is allowed once that
 * provider is configured, and the buttons work without JavaScript.
 */
export const providerHosts = {
  google: 'https://accounts.google.com',
  apple: 'https://appleid.apple.com',
} as const;

/**
 * BA-5, M119 (the live line's ADR-0028): the hosts Google's guide lists for the Maps JavaScript
 * API, allowed only on the pages that show its map (src/lib/map-pages.ts), and only in a build
 * whose map is Google's. Not Google's fonts: the map's buttons use the page's own.
 */
export const googleMapHosts = 'https://*.googleapis.com https://*.gstatic.com *.google.com';

export function contentSecurityPolicy(
  providers: { google: boolean; apple: boolean },
  options: { maps?: boolean } = {},
): string {
  const formAction = [
    "'self'",
    ...(providers.google ? [providerHosts.google] : []),
    ...(providers.apple ? [providerHosts.apple] : []),
  ].join(' ');
  const maps = options.maps === true;
  const join = (...parts: string[]) => parts.filter(Boolean).join(' ');
  return [
    "default-src 'self'",
    maps
      ? join(
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
          googleMapHosts,
          'https://*.ggpht.com *.googleusercontent.com',
        )
      : "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    join("img-src 'self' data:", maps ? `${googleMapHosts} *.googleusercontent.com` : ''),
    "font-src 'self'",
    join("connect-src 'self'", maps ? `${googleMapHosts} data: blob:` : ''),
    ...(maps ? ['frame-src *.google.com', 'worker-src blob:'] : []),
    "frame-ancestors 'none'",
    "base-uri 'self'",
    `form-action ${formAction}`,
    "object-src 'none'",
  ].join('; ');
}

/** Which providers are configured, from the settings (both of a provider's values, as in env). */
export function configuredProviders(source: Record<string, string | undefined>): {
  google: boolean;
  apple: boolean;
} {
  return {
    google: Boolean(source.GOOGLE_CLIENT_ID && source.GOOGLE_CLIENT_SECRET),
    apple: Boolean(source.APPLE_CLIENT_ID && source.APPLE_CLIENT_SECRET),
  };
}

/**
 * BA-5, M132: whether this build's map pages carry Google's hosts: MAP_PROVIDER is google, and
 * it isn't a preview copy (which shows the stand-in: src/lib/env.ts).
 */
export function googleMapsBuild(source: Record<string, string | undefined>): boolean {
  return source.MAP_PROVIDER === 'google' && source.VERCEL_ENV !== 'preview';
}
