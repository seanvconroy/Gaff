import type { SocialProvider } from '@/domain/auth/email-authority';
import { env, type Env } from '@/lib/env';

/**
 * AU1, AU3 (ADR-0028): whether Google and Apple can be used to sign in here.
 *
 * - "live": the provider's settings are there, so it's the real thing.
 * - "stand_in": local development and tests, where a page of Gaff's own plays the provider and
 *   the tester picks who to be. Never on the test copy or in production: anyone who could reach
 *   that page could sign in as anybody.
 * - "off": the button doesn't show.
 */
export type ProviderMode = 'live' | 'stand_in' | 'off';

type Config = Pick<Env, 'GAFF_ENV' | 'DEV_TOOLS' | 'GOOGLE_CLIENT_ID' | 'APPLE_CLIENT_ID'>;

export function providerModes(config: Config = env()): Record<SocialProvider, ProviderMode> {
  const standIn =
    config.DEV_TOOLS && (config.GAFF_ENV === 'development' || config.GAFF_ENV === 'test');
  const otherwise: ProviderMode = standIn ? 'stand_in' : 'off';
  return {
    google: config.GOOGLE_CLIENT_ID ? 'live' : otherwise,
    apple: config.APPLE_CLIENT_ID ? 'live' : otherwise,
  };
}

/** The providers to offer on the sign-in pages, in the order they're shown. */
export function offeredProviders(config: Config = env()): SocialProvider[] {
  const modes = providerModes(config);
  return (['google', 'apple'] as const).filter((provider) => modes[provider] !== 'off');
}
