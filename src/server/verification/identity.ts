import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { startIdentity } from '@/server/identity/identity';

/**
 * M24, P15, P24 (Q48): a letter checks their identity once, as a person: landlords and agents
 * alike, before their first listing goes live. The check belongs to the person; each workspace
 * they're in keeps a copy for its badges and readiness (src/server/identity/identity.ts).
 */
export async function startIdentityCheck(
  member: Member,
  input: { consented: boolean },
): Promise<{ redirectUrl: string }> {
  const started = await startIdentity(member.userId, { ...input, returnTo: 'letter' });
  if ('redirectUrl' in started) return started;
  switch (started.problem) {
    case 'checked':
      throw new UserFacingError('Your identity is already checked.');
    case 'consent_needed':
      throw new UserFacingError('Press “Agree and check my ID” to agree to the selfie check.');
    case 'no_attempts_left':
      throw new UserFacingError(
        'That’s three tries. Reply to any email from us, and a person at Gaff will give you more tries.',
      );
  }
}
