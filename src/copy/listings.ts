/** Emails to letters about their listings (M48, M49, M98). Plain, short, and what happens next. */

export function confirmAvailabilityEmail(input: {
  address: string;
  title: string;
  link: string;
  pausesOn: string;
}): { subject: string; text: string } {
  return {
    subject: `Is ${input.address} still available?`,
    text: [
      'Hello,',
      '',
      `Renters trust Gaff because every home on it is still available. Is ${input.title} still to let?`,
      '',
      'If it is, confirm it with one tap:',
      input.link,
      '',
      `If we don’t hear from you, the listing is paused on ${input.pausesOn} until you confirm. Nothing else changes, and you can confirm at any time.`,
      '',
      'Gaff',
    ].join('\n'),
  };
}

export function listingPausedEmail(input: { address: string; title: string; link: string }): {
  subject: string;
  text: string;
} {
  return {
    subject: `${input.address} is paused until you confirm it’s available`,
    text: [
      'Hello,',
      '',
      `We haven’t heard that ${input.title} is still available, so renters can’t see it for now.`,
      '',
      'If it’s still to let, confirm it and it goes live again straight away:',
      input.link,
      '',
      'Gaff',
    ].join('\n'),
  };
}

export const holdReasonWords: Record<string, string> = {
  photo_reused: 'Some photos look the same as photos on another letter’s listing.',
  rent_far_below: 'The rent is much lower than similar homes nearby.',
  scam_wording: 'The description asks for money or contact before a viewing.',
  description_copied: 'The description matches another letter’s listing.',
  new_account_burst: 'A new account listed several homes at once.',
  unfair_wording: 'Some of the wording could exclude people the Equal Status Acts protect.',
};

/** ADR-0023, P13: what the AI flagged, in the letter's words, with a fairer way to say it. */
export function listingHeldForWordingEmail(input: {
  title: string;
  findings: ReadonlyArray<{ phrase: string; why: string; rewording: string }>;
}): { subject: string; text: string } {
  return {
    subject: `${input.title} is waiting for a person at Gaff`,
    text: [
      'Hello,',
      '',
      `We’ve taken ${input.title} off Gaff for now, because some of its wording could exclude people that equality law protects:`,
      '',
      ...input.findings.flatMap((f) => [
        `“${f.phrase}”: ${f.why}`,
        `You could say: “${f.rewording}”`,
        '',
      ]),
      'A person at Gaff will look at it within one working day, and put it back or tell you what to change. You can edit the words in the meantime.',
      '',
      'Gaff',
    ].join('\n'),
  };
}

export const removalReasonWords = {
  scam: 'it shows signs of a rental scam',
  discrimination: 'it discriminates on a ground the Equal Status Acts protect',
  misleading: 'it’s misleading about the home or its terms',
  duplicate: 'it duplicates another listing',
  offensive: 'it contains offensive content',
  other: 'it breaks Gaff’s listing policy',
} as const;

/**
 * M98 (Digital Services Act, Article 17): statements of reasons. Each says what was decided,
 * why, the rule or law it rests on, whether it was automatic, and how to appeal. Versioned: the
 * solicitor reviews each version (launch checklist).
 */
export const REMOVAL_STATEMENT = 'listing_removed@2';
export const AUTOMATIC_PAUSE_STATEMENT = 'listing_paused_automatically@1';
export const ACCOUNT_STATEMENT = 'account_action@1';

const appealLines = (appealUrl: string) => [
  'If you think we got it wrong, you can appeal within 6 months. A different person at Gaff reviews every appeal and tells you the outcome:',
  appealUrl,
];

export function listingRemovedEmail(input: {
  address: string;
  reason: keyof typeof removalReasonWords;
  source: string;
  decidedOn: string;
  appealUrl: string;
}): { subject: string; text: string } {
  return {
    subject: `We’ve removed your listing for ${input.address}`,
    text: [
      'Hello,',
      '',
      `A person at Gaff reviewed your listing for ${input.address} on ${input.decidedOn} and removed it, because ${removalReasonWords[input.reason]}.`,
      '',
      `This rests on ${input.source}.`,
      '',
      'What this means: renters can no longer see the listing or enquire through it. Renters who already enquired keep hearing from you as before.',
      '',
      ...appealLines(input.appealUrl),
      '',
      'Gaff',
    ].join('\n'),
  };
}

/** M97: a pause by the rules, before a person looks. It says so, and that it isn't a removal. */
export function listingPausedForReviewEmail(input: { address: string; reviewBy: string }): {
  subject: string;
  text: string;
} {
  return {
    subject: `Your listing for ${input.address} is paused while we check a report`,
    text: [
      'Hello,',
      '',
      `Renters reported your listing for ${input.address} as a possible scam, and Gaff’s rules paused it automatically while a person checks. A pause isn’t a removal, and nothing else in your account has changed.`,
      '',
      `A person at Gaff will look at it by ${input.reviewBy}. If it’s fine, it goes live again straight away, and we’ll tell you either way.`,
      '',
      'This rests on Gaff’s listing policy: listings with strong signs of a scam are paused until a person checks them.',
      '',
      'Gaff',
    ].join('\n'),
  };
}

export const accountActionWords = {
  pause_account: 'paused',
  suspend_account: 'suspended',
} as const;

/** M107: an account action. */
export function accountActionEmail(input: {
  organisationName: string;
  action: keyof typeof accountActionWords;
  reason: keyof typeof removalReasonWords;
  source: string;
  decidedOn: string;
  appealUrl: string;
}): { subject: string; text: string } {
  const what = accountActionWords[input.action];
  return {
    subject: `Gaff has ${what} ${input.organisationName}’s listings`,
    text: [
      'Hello,',
      '',
      `A person at Gaff reviewed ${input.organisationName}’s listings on ${input.decidedOn} and ${what} the account, because ${removalReasonWords[input.reason]}.`,
      '',
      `This rests on ${input.source}.`,
      '',
      'What this means: renters can’t see any of your listings, and you can’t publish new ones until it’s restored. Your lettings, and renters who already enquired, carry on as before.',
      '',
      ...appealLines(input.appealUrl),
      '',
      'Gaff',
    ].join('\n'),
  };
}

/** M98: the outcome of an appeal, decided by a different person at Gaff. */
export function appealOutcomeEmail(input: { address: string; upheld: boolean }): {
  subject: string;
  text: string;
} {
  return {
    subject: input.upheld ? 'Your appeal was successful' : 'The outcome of your appeal',
    text: [
      'Hello,',
      '',
      input.upheld
        ? `A different person at Gaff reviewed your appeal about ${input.address} and agreed with you. Anything we paused is live again; if we removed a listing, you can list the home again from Listings straight away.`
        : `A different person at Gaff reviewed your appeal about ${input.address} and kept the decision, for the reasons we gave before.`,
      '',
      input.upheld
        ? 'We’re sorry for the trouble.'
        : 'If you disagree, you can take it to an out-of-court dispute settlement body under the Digital Services Act, or to the courts.',
      '',
      'Gaff',
    ].join('\n'),
  };
}
