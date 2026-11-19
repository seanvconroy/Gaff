import type { SignInProvider } from '@/domain/auth/methods';

/**
 * Port for "Continue with Google" and "Continue with Apple" (Q30: approved for sign-in only).
 *
 * Better Auth runs the exchange with a provider and gives back one thing: who the person is.
 * Adapters: the real providers (switched on by their credentials, in src/server/auth/auth.ts),
 * and a local stand-in (src/adapters/sign-in/stand-in.ts) where a tester says who is signing
 * in. Nothing else about the person is asked for or kept: no tokens, no contacts, no photo.
 */
export interface ProviderPerson {
  provider: SignInProvider;
  /** The provider's own ID for the person. Never shown. */
  id: string;
  /** Their email, which may be an Apple relay address (UX-SI-11). */
  email: string;
  /** Whether the provider has checked the address is theirs. Only then is it trusted. */
  emailVerified: boolean;
  /**
   * AU4: Google's `hd`, the Google Workspace domain, which Google sends only for an address it
   * hosts. With a Gmail address, Google hosts it without one.
   */
  hostedDomain?: string;
  name: string;
}
