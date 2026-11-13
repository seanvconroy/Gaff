/**
 * AU3, AU16: the ways into a Gaff account. The method a session began with is kept on the
 * session, as a code, for the sign-in record and for staff, who need a passkey (M5).
 */

export const signInMethods = ['password', 'email_code', 'google', 'apple', 'passkey'] as const;
export type SignInMethod = (typeof signInMethods)[number];

export const methodWords: Record<SignInMethod, string> = {
  password: 'a password',
  email_code: 'a code by email',
  google: 'Google',
  apple: 'Apple',
  passkey: 'a passkey',
};

/** The method behind a sign-in call, by its route (and provider, for Google and Apple). */
export function methodForPath(path: string, providerId?: string): SignInMethod | null {
  switch (path) {
    case '/sign-in/email':
      return 'password';
    case '/sign-in/email-otp':
    case '/email-otp/verify-email':
      return 'email_code';
    case '/passkey/verify-authentication':
      return 'passkey';
    default:
      // Coming back from Google or Apple: the route is "/callback/:id", or the path with its name.
      if (!path.startsWith('/callback/')) return null;
      return providerId === 'google' || providerId === 'apple' ? providerId : null;
  }
}
