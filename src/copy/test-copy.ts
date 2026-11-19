/**
 * Words that appear only on the test copy (GAFF_ENV=staging), never in development, tests or
 * production. They tell testers what is real and what is a stand-in, so nobody takes the test
 * copy for the real Gaff.
 */

/** Added to an email that would invite a reply, while the test copy can't receive email. */
export const TEST_COPY_REPLY_NOTE =
  'This is Gaff’s test copy, which can’t receive replies by email yet. To write back, use the link in this email, or sign in to Gaff and open Enquiries.';

/** The banner on every page of the test copy. */
export const TEST_COPY_BANNER = {
  title: 'Gaff test copy',
  body: 'Use made-up names, numbers and homes. Emails are real; texts and ID checks are stand-ins.',
};

/** The outbox's words on the test copy, where real people get real email. */
export const TEST_COPY_OUTBOX = {
  eyebrow: 'Test copy',
  lead: 'Email to made-up people (addresses at example.com, example.ie, .test and the like), and every text. Real people get real email. Links work as they would in a real inbox.',
};
