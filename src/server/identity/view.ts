import { identityStage } from '@/domain/identity/access';
import { currentUser } from '@/server/auth/member';
import { identityOf } from './identity';
import { isApplicationsRenter } from './renter';

/** "a•••@gmail.com": enough to recognise the address, not enough to read it off a screen. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}•••@${domain}`;
}

/** P15, P29: what the chosen renter's identity step shows, for whoever is looking. */
export async function renterIdentityView(token: string, applicationEmail: string) {
  const user = await currentUser();
  const signedIn = await isApplicationsRenter(token, user?.id ?? null);
  const identity = signedIn && user ? await identityOf(user.id) : null;
  return {
    signedIn,
    maskedEmail: maskEmail(applicationEmail),
    where: identityStage(identity),
    reason: identity?.status === 'not_verified' ? identity.reason : null,
    attemptsLeft: identity?.attemptsLeft ?? 3,
    checkedAt: identity?.checkedAt ?? null,
  };
}
