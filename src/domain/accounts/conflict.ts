import { normaliseEmail } from '@/domain/enquiries/parse';

/**
 * UX-AC-14 (rule 1): a member who has applied, as a renter, for a home their own organisation
 * lets can't open that letting in the workspace, and can't decide anything on it. Nobody judges
 * their own application.
 *
 * WHAT IS MATCHED. Two things, and either is enough:
 *
 * - The person. An enquiry a signed-in renter has shown to be theirs is in their own Enquiries
 *   (UX-RH-4, work package WP-14). If the member's Enquiries hold this letting, they applied for
 *   it, whatever address the enquiry came from. That list is the member's own: it is read on
 *   their own path, for their own ID, and tells the organisation nothing but yes or no.
 * - The address. An application that arrived by email, from Daft or MyHome, may never have been
 *   opened by a signed-in person. So the member's verified sign-in address is still matched
 *   against the addresses of the people who enquired about the home.
 */
export function appliedForThisLetting(
  member: { email: string; emailVerified: boolean },
  /** The normalised addresses of everyone who enquired about the letting. */
  applicantEmails: readonly string[],
  /** The member's own Enquiries hold an enquiry about this letting. */
  inTheirEnquiries = false,
): boolean {
  if (inTheirEnquiries) return true;
  // An address nobody has verified proves nothing about who holds it.
  if (!member.emailVerified) return false;
  const own = normaliseEmail(member.email);
  return own !== '' && applicantEmails.includes(own);
}
