import type { AccountEmail } from './account-emails';

/**
 * M49 (BA-13): the words about keeping a live home fresh, for its lister. Plain and short; each
 * says what happens next, and when. The email is fixed wording, pinned word for word by
 * `freshness.test.ts`: NEW WORDING, for the solicitor.
 */
export const freshnessCopy = {
  /** Today's row, and the letting's Needs you. */
  today: {
    task: 'Say if it’s still available',
    asked: (on: string) => `Comes off gaff.ie on ${on} unless you do`,
    stale: 'Off gaff.ie until you say it’s still available. Its enquiries are waiting',
  },
  /** The Home view's "On gaff.ie". */
  onGaff: 'Not shown on gaff.ie until you say it’s still available.',
  /** The letting's Needs you button. */
  action: 'Still available',
  /** The task, from Today or the letting (signed in), and the email's link (no sign-in). */
  page: {
    title: 'Is it still available?',
    asked: (on: string) =>
      `It’s been two weeks with no change. If it’s still available, say so and it stays on gaff.ie. If we don’t hear by ${on}, it comes off gaff.ie and search until you do.`,
    stale: (on: string) =>
      `It came off gaff.ie and search on ${on}, because nobody said it was still available. Its enquiries are waiting: Gaff answers them as soon as you say it is.`,
    let: 'If it’s been let, close the letting instead: everyone who enquired is told.',
    close: 'Close the letting',
    /** On the email's page, where nobody is signed in. */
    letByEmail:
      'If it’s been let, sign in to Gaff and close the letting instead: everyone who enquired is told.',
    button: 'Still available',
    pending: 'Saving',
    back: 'Back to the letting',
    next: 'We’ll ask again in two weeks if nothing changes.',
  },
  /** After "Still available": on the letting (signed in), or after the email's link. */
  done: {
    title: 'Thanks',
    text: 'It stays on gaff.ie. We’ll ask again in two weeks if nothing changes.',
    back: 'It’s back on gaff.ie, and Gaff is answering the enquiries that waited. We’ll ask again in two weeks if nothing changes.',
    action: 'Open Gaff',
  },
  /** The email's link, once it has done its job or has been replaced. */
  expired: {
    title: 'This link has already been used',
    text: 'It may have been answered already, or the home has changed since. Open the letting on Gaff to see where it stands.',
    action: 'Open Gaff',
  },
} as const;

/**
 * M49: the one email that asks. To the home's lead. One link, which opens a page that asks
 * before it changes anything. NEW WORDING for the solicitor.
 */
export function stillAvailableEmail(input: {
  address: string;
  link: string;
  /** "Thursday 6 November" */
  stepsBackOn: string;
  lettingUrl: string;
}): AccountEmail {
  return {
    subject: `Is ${input.address} still available?`,
    button: 'Still available',
    text: [
      'Hello,',
      '',
      `${input.address} has been on Gaff for two weeks with no change. Renters want to know the homes they find are still there.`,
      '',
      input.link,
      '',
      `If it’s still available, press Still available and it stays on gaff.ie. If we don’t hear by ${input.stepsBackOn}, it comes off gaff.ie and search until you say it is, and its enquiries wait for you.`,
      '',
      `If it’s been let, close the letting on Gaff: ${input.lettingUrl}`,
      '',
      'Gaff',
    ].join('\n'),
  };
}
