/**
 * Words that appear only on the test copy (GAFF_ENV=staging), never in development, tests or
 * production. They tell testers what is real and what is a stand-in, so nobody takes the test
 * copy for the real Gaff.
 */

/** Added to an email that would invite a reply, while the test copy can't receive email. */
export const TEST_COPY_REPLY_NOTE =
  'This is Gaff’s test copy, which can’t receive replies by email yet. To write back, use the link in this email, or sign in to Gaff and open Enquiries.';

/**
 * The banner on every page of the test copy. Once texts are really sent (Sinch is set up), a
 * made-up mobile number would text a stranger, so the banner asks for the tester's own.
 */
export const TEST_COPY_BANNER = {
  title: 'Gaff test copy',
  body: 'Use made-up names, numbers and homes. Emails are real; texts and ID checks are stand-ins.',
  bodyWithRealTexts:
    'Use made-up names and homes, and your own mobile number. Emails and texts are real; ID checks are stand-ins.',
};

/** "Add test enquiries", in a live letting's menu wherever the development tools are on. */
export const TEST_ENQUIRIES = {
  menu: 'Add test enquiries',
  adding: 'Adding test enquiries…',
};

/** What "Add test enquiries" did, above People. */
export function testEnquiriesAdded(added: number): string {
  if (added === 0) return 'No test enquiries were added. Try again in a minute.';
  const who = added === 1 ? '1 made-up renter has' : `${added} made-up renters have`;
  return `${who} enquired, as if from Daft and MyHome. Their emails are in the outbox.`;
}

/** The outbox's words on the test copy, where real people get real email. */
export const TEST_COPY_OUTBOX = {
  eyebrow: 'Test copy',
  lead: 'Email to made-up people (addresses at example.com, example.ie, .test and the like), and every text. Real people get real email. Links work as they would in a real inbox.',
  /** Once texts are really sent, none is here. */
  leadWithRealTexts:
    'Email to made-up people (addresses at example.com, example.ie, .test and the like). Real people get real email, and texts go to real phones. Links work as they would in a real inbox.',
};

/** P16: where texts aren't sent, the code that would have gone by text, on the screen. */
export function testCopyMobileCode(code: string): string {
  return `Test copy: texts aren’t sent, so here’s your code: ${code}.`;
}
