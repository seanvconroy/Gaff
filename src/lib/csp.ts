/**
 * The Content Security Policy (next.config.ts). Fonts are self-hosted and no third-party
 * scripts load, so 'self' covers everything, except where a form's answer goes and, with
 * Supabase Storage, where a photo is sent (M43).
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

export function contentSecurityPolicy(
  providers: { google: boolean; apple: boolean },
  /** M43: the photo store's origin, where browsers send photos straight to it. */
  photoUploads: string | null = null,
): string {
  const formAction = [
    "'self'",
    ...(providers.google ? [providerHosts.google] : []),
    ...(providers.apple ? [providerHosts.apple] : []),
  ].join(' ');
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self'${photoUploads ? ` ${photoUploads}` : ''}`,
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
    // BA-8: a static secret, or what the server makes one from.
    apple: Boolean(
      source.APPLE_CLIENT_ID &&
      (source.APPLE_CLIENT_SECRET ||
        (source.APPLE_TEAM_ID && source.APPLE_KEY_ID && source.APPLE_PRIVATE_KEY)),
    ),
  };
}

/**
 * M43 (ADR-0023): where browsers send photos straight to the photo store, its origin, so the
 * page may reach it (connect-src) and nothing else. Only Supabase Storage takes them; with the
 * local store, photos go through Gaff's own server and the policy stays 'self'.
 */
export function photoUploadOrigin(source: Record<string, string | undefined>): string | null {
  if (source.PHOTO_STORE !== 'supabase' || !source.SUPABASE_URL) return null;
  try {
    return new URL(source.SUPABASE_URL).origin;
  } catch {
    return null;
  }
}
