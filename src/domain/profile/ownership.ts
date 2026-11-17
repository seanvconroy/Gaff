import { normaliseEmail } from '@/domain/enquiries/parse';

/**
 * UX-RH-4, UX-AC-5: whether an enquiry is the signed-in person's own, so it can be added to their
 * Enquiries, filled from their profile and kept on it.
 *
 * A private link opens the page for whoever holds it, and links get forwarded: to a partner, a
 * parent, a friend. Holding the link isn't enough to make someone else's enquiry part of a
 * person's own profile. It is theirs when one of these holds:
 *
 * - it is already in their Enquiries;
 * - they are signed in with the address the enquiry came from, and that address is verified;
 * - this browser entered the one-time code sent to the enquiry's address a short while ago
 *   (UX-SI-12), which shows the person at the keyboard reads that inbox.
 *
 * Nobody signed in, nothing is theirs: there is no profile for it to belong to.
 */
export function enquiryIsTheirs(input: {
  /** The signed-in person, if anyone is signed in. */
  person: { email: string; emailVerified: boolean } | null;
  /** The email on the application. */
  applicationEmail: string;
  /** This browser holds the pass for this link's one-time code. */
  hasPass: boolean;
  /** The enquiry is already in this person's Enquiries. */
  attached: boolean;
}): boolean {
  if (!input.person) return false;
  if (input.attached || input.hasPass) return true;
  if (!input.person.emailVerified) return false;
  const own = normaliseEmail(input.person.email);
  return own !== '' && own === normaliseEmail(input.applicationEmail);
}
