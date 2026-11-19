import { describe, expect, it } from 'vitest';
import { configuredProviders, contentSecurityPolicy, photoUploadOrigin } from './csp';

const formAction = (policy: string) =>
  policy.split('; ').find((directive) => directive.startsWith('form-action '));

describe('BA-1, AU1: forms may send the browser on to a configured sign-in provider', () => {
  it('allows only Gaff itself when neither provider is configured', () => {
    expect(formAction(contentSecurityPolicy({ google: false, apple: false }))).toBe(
      "form-action 'self'",
    );
  });

  it('allows Google’s and Apple’s sign-in hosts once each is configured', () => {
    expect(formAction(contentSecurityPolicy({ google: true, apple: false }))).toBe(
      "form-action 'self' https://accounts.google.com",
    );
    expect(formAction(contentSecurityPolicy({ google: true, apple: true }))).toBe(
      "form-action 'self' https://accounts.google.com https://appleid.apple.com",
    );
  });

  it('counts a provider as configured with both of its values', () => {
    expect(configuredProviders({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's' })).toEqual({
      google: true,
      apple: false,
    });
    expect(configuredProviders({ APPLE_CLIENT_ID: 'ie.gaff.signin' })).toEqual({
      google: false,
      apple: false,
    });
    // BA-8: Apple's secret made on the server, from its three values.
    expect(
      configuredProviders({
        APPLE_CLIENT_ID: 'ie.gaff.signin',
        APPLE_TEAM_ID: 'TEAM123456',
        APPLE_KEY_ID: 'KEY1234567',
        APPLE_PRIVATE_KEY: 'a key',
      }),
    ).toEqual({ google: false, apple: true });
  });

  it('keeps the rest of the policy as it was', () => {
    const policy = contentSecurityPolicy({ google: true, apple: true });
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
  });

  it('M43: lets a page send photos to the photo store only where photos go straight to it', () => {
    const none = { google: false, apple: false };
    expect(contentSecurityPolicy(none)).toContain("connect-src 'self';");
    const origin = photoUploadOrigin({
      PHOTO_STORE: 'supabase',
      SUPABASE_URL: 'https://example-ref.supabase.co/',
    });
    expect(origin).toBe('https://example-ref.supabase.co');
    expect(contentSecurityPolicy(none, { photoUploads: origin })).toContain(
      "connect-src 'self' https://example-ref.supabase.co;",
    );
    expect(
      photoUploadOrigin({ PHOTO_STORE: 'local', SUPABASE_URL: 'https://x.supabase.co' }),
    ).toBeNull();
    expect(photoUploadOrigin({ PHOTO_STORE: 'supabase' })).toBeNull();
  });
});

describe('BA-6, P17: the ID check’s form may send the browser on to Stripe Identity', () => {
  it('allows Stripe’s verification pages once Stripe is the ID provider, and not before', () => {
    expect(
      formAction(contentSecurityPolicy({ google: false, apple: false, stripeIdentity: true })),
    ).toBe("form-action 'self' https://verify.stripe.com");
    expect(
      formAction(contentSecurityPolicy({ google: false, apple: false, stripeIdentity: false })),
    ).toBe("form-action 'self'");
  });
});
