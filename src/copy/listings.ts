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
};

export const removalReasonWords = {
  scam: 'it shows signs of a rental scam',
  discrimination: 'it discriminates on a ground the Equal Status Acts protect',
  misleading: 'it’s misleading about the home or its terms',
  duplicate: 'it duplicates another listing',
  other: 'it breaks Gaff’s listing policy',
} as const;

/** M98 (Digital Services Act, Article 17): the statement of reasons for a removal. */
export function listingRemovedEmail(input: {
  address: string;
  reason: keyof typeof removalReasonWords;
  decidedOn: string;
}): { subject: string; text: string } {
  return {
    subject: `We’ve removed your listing for ${input.address}`,
    text: [
      'Hello,',
      '',
      `A person at Gaff reviewed your listing for ${input.address} on ${input.decidedOn} and removed it, because ${removalReasonWords[input.reason]}.`,
      '',
      'What this means: renters can no longer see the listing or enquire through it. Nothing else in your account has changed.',
      '',
      'If you think we got it wrong, reply to this email within 6 months and tell us why. A different person at Gaff will review it and let you know the outcome.',
      '',
      'Gaff',
    ].join('\n'),
  };
}
