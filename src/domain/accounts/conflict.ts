import { normaliseEmail } from '@/domain/enquiries/parse';

/**
 * UX-AC-14 (rule 1): a member who has applied, as a renter, for a home their own organisation
 * lets can't open that letting in the workspace, and can't decide anything on it. Nobody judges
 * their own application.
 *
 * WHAT IS MATCHED TODAY. An application arrives by email, from Daft or MyHome, and isn't tied to
 * a person's profile yet. So the match is the address: the member's verified sign-in address
 * against the addresses of the people who enquired about the home. A member who enquired from
 * another address isn't caught. Work package WP-14 ties an application to the renter's profile
 * ("may be theirs" in section 2's diagram); the match then becomes the person, and this rule
 * takes `applicantUserIds` beside the addresses.
 */
export function appliedForThisLetting(
  member: { email: string; emailVerified: boolean },
  /** The normalised addresses of everyone who enquired about the letting. */
  applicantEmails: readonly string[],
): boolean {
  // An address nobody has verified proves nothing about who holds it.
  if (!member.emailVerified) return false;
  const own = normaliseEmail(member.email);
  return own !== '' && applicantEmails.includes(own);
}
