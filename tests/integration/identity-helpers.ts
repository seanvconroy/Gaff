import { recordIdentityOutcome, startIdentity } from '@/server/identity/identity';
import type { IdentityOutcome } from '@/ports/identity';

/** The opaque check ID in the stand-in page's address (the stand-in for Stripe's pages). */
export function checkIdIn(redirectUrl: string): string {
  const found = /\/dev\/identity\/([^/?]+)/.exec(redirectUrl)?.[1];
  if (!found) throw new Error(`Not a stand-in identity link: ${redirectUrl}`);
  return found;
}

/** Starts a person's check through the stand-in and records what "Stripe" found. */
export async function checkIdentity(
  userId: string,
  options: { returnTo?: 'renter' | 'letter'; outcome?: IdentityOutcome } = {},
): Promise<string> {
  const started = await startIdentity(userId, {
    consented: true,
    returnTo: options.returnTo ?? 'renter',
  });
  if (!('redirectUrl' in started)) throw new Error(`The check didn't start: ${started.problem}`);
  const checkId = checkIdIn(started.redirectUrl);
  await recordIdentityOutcome({
    checkId,
    userId,
    outcome: options.outcome ?? {
      status: 'passed',
      verifiedName: { first: 'Mary', last: 'Walsh' },
    },
  });
  return checkId;
}
