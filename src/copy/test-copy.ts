/**
 * Words that appear only on the test copy (GAFF_ENV=staging), never in production. They tell
 * testers what's real and what's a stand-in, so nobody mistakes the test copy for the real thing.
 */

/** Added to emails that would invite a reply, while the test copy can't receive email. */
export const TEST_COPY_REPLY_NOTE =
  'This is Gaff’s test copy, which can’t receive replies by email yet. To write back, use the link in this email, or sign in to Gaff and open Your homes.';

/** The banner on every page of the test copy. */
export const TEST_COPY_BANNER = {
  title: 'Gaff test copy',
  body: 'Made-up homes and letters. Emails are real; texts, ID checks and the AI are stand-ins.',
};

/** Shown under the mobile form, because texts aren't sent from the test copy. */
export function testCopyMobileCode(code: string): string {
  return `Test copy: texts aren’t sent yet, so here’s your code: ${code}.`;
}
