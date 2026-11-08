import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { chooseOffline, startIdentity } from '@/server/identity/identity';

/**
 * M24, P15, P24 (Q48): a letter checks their identity once, as a person: landlords and agents
 * alike, before their first listing goes live. The check belongs to the person; each workspace
 * they're in keeps a copy for its badges and readiness (src/server/identity/identity.ts).
 */
export async function startIdentityCheck(
  member: Member,
  input: { selfie: boolean; consented: boolean },
): Promise<{ redirectUrl: string }> {
  const started = await startIdentity(member.userId, { ...input, returnTo: 'letter' });
  if ('redirectUrl' in started) return started;
  switch (started.problem) {
    case 'checked':
      throw new UserFacingError('Your identity is already checked.');
    case 'consent_needed':
      throw new UserFacingError(
        'Tick the box to agree to the selfie, or check your ID without a selfie.',
      );
    case 'no_attempts_left':
      throw new UserFacingError(
        'That’s three tries. Choose “My ID can’t be checked online”, and a person at Gaff will check it with you.',
      );
  }
}

/** P20, Q55: the letter's ID can't be checked online; a person at Gaff checks it another way. */
export async function identityOffline(member: Member): Promise<void> {
  await chooseOffline(member.userId);
}
