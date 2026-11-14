import type { Limit } from '@/domain/auth/limits';

/**
 * AU9, M16: an invitation is for the person it was sent to. Whoever accepts must be signed in
 * with the invited email, confirmed, so a forwarded link doesn't let someone else onto the team.
 * The link itself never signs anyone in.
 */
export function invitationIsFor(
  invitedEmail: string | null,
  user: { email: string; emailVerified: boolean },
): boolean {
  if (!invitedEmail || !user.emailVerified) return false;
  return invitedEmail.trim().toLowerCase() === user.email.trim().toLowerCase();
}

/** AU9: an invitation link works once, for this long. */
export const INVITATION_DAYS = 7;

/**
 * AU12: invitations one workspace may send in an hour, new or sent again, so a workspace can't
 * be used to fill someone's inbox.
 */
export const INVITATION_LIMIT: Limit = { max: 30, windowSeconds: 3600 };
