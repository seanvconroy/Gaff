import { z } from 'zod';

/**
 * UX-TS-5: Gaff's own team (the founders) see one internal page. They're named by email in the
 * STAFF_EMAILS setting, separated by commas. It's empty by default, so nobody is staff until a
 * deployment says so. Being staff gives nothing in any operator's workspace (Q13).
 */
export const staffEmailsSchema = z
  .string()
  .default('')
  .transform((raw) =>
    raw
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email !== ''),
  )
  .pipe(z.array(z.email('STAFF_EMAILS must be email addresses separated by commas')));

/** Only a signed-in person whose email has been verified, and is on the list, is staff. */
export function isStaff(
  user: { email: string; emailVerified: boolean } | null | undefined,
  staffEmails: readonly string[],
): boolean {
  if (!user || !user.emailVerified) return false;
  return staffEmails.includes(user.email.trim().toLowerCase());
}
