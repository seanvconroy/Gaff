import type { ReportReason } from '@/domain/homes/report';
import type { CaseFact } from '@/domain/trust/cases';
import type { AccountEmail } from './account-emails';

/**
 * UX-TS-4, BA-9 (the live line's M97, M98; DSA articles 16, 17 and 20; for the solicitor): the
 * fixed words Gaff sends about a reported listing. To the lister (the letting's lead and the
 * organisation's admins): that the rules took it off at once while a person checks; a person's
 * decision, with its statement of reasons; that it's back; and the answer to an appeal. To a
 * visitor who reported it and asked to hear: the outcome. Each is pinned word for word by
 * `trust-emails.test.ts`: a change here is a decision, not a side effect. None names who
 * reported a listing.
 */

/** What a decision to hide relies on, as the lister reads it: after "What we relied on: ". */
export const caseFactWords: Record<CaseFact, string> = {
  reports: 'the reports we received',
  /** BA-10 (M29): a listing the checks held as it went public. */
  checks: 'the checks Gaff makes on every home before it goes on gaff.ie',
  photos: 'the home’s photos',
  description: 'the home’s description',
  rent: 'the rent asked',
  address: 'the home’s address',
  lister: 'the lister’s details on its page',
};

/** M98: the rule or law each reason rests on, for the statement of reasons. */
export const reasonGrounds: Record<ReportReason, string> = {
  scam: 'Gaff’s listing rules: every home on gaff.ie must be a real home, offered by someone who may let it',
  wrong_details: 'Gaff’s listing rules: a listing’s details must be accurate',
  unfair:
    'the Equal Status Acts 2000 to 2018, and Gaff’s listing rules: a listing must be fair to everyone who may apply',
  something_else: 'Gaff’s listing rules',
};

/** "a", "a and b", "a, b and c". */
function inWords(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/** The facts a decision relies on, in words, in the fixed order. */
export function factsInWords(facts: readonly CaseFact[]): string {
  return inWords(facts.map((fact) => caseFactWords[fact]));
}

const whileOff =
  'While it’s off, it has no page and isn’t in search. Gaff isn’t answering its enquiries: they wait, and are answered when it’s back.';

/**
 * M97: the rules took a home off at once, on strong signs of a scam, until a person looks. It
 * says it was automatic, and that a person will decide.
 */
export function listingHeldEmail(input: { address: string; lettingUrl: string }): AccountEmail {
  return {
    subject: `${input.address} is off gaff.ie while we check a report`,
    button: 'Open the letting',
    text: [
      'Hello,',
      '',
      `Visitors reported ${input.address} as a possible scam, so Gaff’s rules took it off gaff.ie automatically while a person checks. Nobody has decided anything about it yet.`,
      '',
      whileOff,
      '',
      input.lettingUrl,
      '',
      'A person on Gaff’s team will look at it within four working hours. If it’s fine, it goes straight back on gaff.ie, and we’ll email you either way.',
      '',
      'Gaff',
    ].join('\n'),
  };
}

/**
 * UX-TS-4, M98: a person took a home off gaff.ie, with the statement of reasons: what was done,
 * why (one of four fixed reasons), the facts relied on (fixed), what it rests on, that a person
 * decided it and when, what it means for enquiries, and how to appeal.
 */
export function listingHiddenEmail(input: {
  address: string;
  reason: ReportReason;
  facts: readonly CaseFact[];
  /** "Thursday 19 November". */
  decidedOn: string;
  /** From `hiddenReasons`: "some of its details look wrong". */
  reasonWords: string;
  lettingUrl: string;
}): AccountEmail {
  return {
    subject: `${input.address} is off gaff.ie for now`,
    button: 'Open the letting',
    text: [
      'Hello,',
      '',
      `Gaff’s team has taken ${input.address} off gaff.ie after a report: ${input.reasonWords}.`,
      '',
      `What we relied on: ${factsInWords(input.facts)}. This rests on ${reasonGrounds[input.reason]}. A person on Gaff’s team decided this on ${input.decidedOn}.`,
      '',
      whileOff,
      '',
      'If you think we got it wrong, or once you’ve put right anything that needs it, press “Ask Gaff to look again” on the letting. You can ask once, within six months.',
      '',
      input.lettingUrl,
      '',
      'A different person on Gaff’s team will look within one working day of your asking, and email you.',
      '',
      'Gaff',
    ].join('\n'),
  };
}

/** UX-TS-4: a hidden home is back: a person found nothing wrong, or agreed on appeal. */
export function listingBackEmail(input: { address: string; lettingUrl: string }): AccountEmail {
  return {
    subject: `${input.address} is back on gaff.ie`,
    button: 'Open the letting',
    text: [
      'Hello,',
      '',
      `Gaff’s team has looked again at ${input.address}, and it’s back on gaff.ie, with its page and its place in search.`,
      '',
      'Gaff is answering its enquiries again, starting with anyone who enquired while it was off.',
      '',
      input.lettingUrl,
      '',
      'There’s nothing you need to do.',
      '',
      'Gaff',
    ].join('\n'),
  };
}

/** M98: the answer to an appeal that keeps the home off gaff.ie, with its own statement. */
export function appealKeptEmail(input: {
  address: string;
  reason: ReportReason;
  facts: readonly CaseFact[];
  decidedOn: string;
  reasonWords: string;
  lettingUrl: string;
}): AccountEmail {
  return {
    subject: `${input.address} stays off gaff.ie`,
    button: 'Open the letting',
    text: [
      'Hello,',
      '',
      `A different person on Gaff’s team has looked again at ${input.address}, as you asked, and it stays off gaff.ie: ${input.reasonWords}.`,
      '',
      `What we relied on: ${factsInWords(input.facts)}. This rests on ${reasonGrounds[input.reason]}. A person on Gaff’s team decided this on ${input.decidedOn}.`,
      '',
      'You can’t ask Gaff to look again a second time. You can take it to an out-of-court dispute settlement body certified under the EU Digital Services Act, or to the courts.',
      '',
      input.lettingUrl,
      '',
      'While it’s off, Gaff isn’t answering its enquiries. Nothing more happens unless you take it further.',
      '',
      'Gaff',
    ].join('\n'),
  };
}

/**
 * M96: to a visitor who reported a listing and asked to hear the outcome. The address is
 * deleted once this is sent.
 */
export function reportOutcomeEmail(input: {
  address: string;
  hidden: boolean;
  searchUrl: string;
}): AccountEmail {
  return {
    subject: 'What we decided about the listing you reported',
    button: 'Search homes on Gaff',
    text: [
      'Hello,',
      '',
      input.hidden
        ? `A person on Gaff’s team looked at the listing for ${input.address} that you reported, and took it off gaff.ie. Thank you for telling us.`
        : `A person on Gaff’s team looked at the listing for ${input.address} that you reported, and found it keeps to Gaff’s listing rules, so it stays on gaff.ie. Thank you for telling us.`,
      '',
      input.searchUrl,
      '',
      'We’ve deleted your email address now, so you won’t hear from us again about it. There’s nothing more you need to do.',
      '',
      'Gaff',
    ].join('\n'),
  };
}

// ---------------------------------------------------------------------------------------------
// BA-10 (the live line's M29, M48, M98, M107): the checks a home passes as it goes public, and
// a paused lister. New wording, for the solicitor's list; pinned by `trust-emails.test.ts`.

/** "“a”", "“a” and “b”": phrases the AI's wording check found, in the lister's own words. */
function quoted(phrases: readonly string[]): string {
  return inWords(phrases.map((phrase) => `“${phrase}”`));
}

/**
 * M48, M29: the checks held a home for a person on Gaff's team as it went public. It says nobody
 * has decided anything, and when a person will look. Wording the AI found is quoted, so the
 * lister can change it while they wait; nothing else about the checks is said.
 */
export function listingCheckingEmail(input: {
  address: string;
  /** "Thursday 19 November, 2pm". */
  lookBy: string;
  /** P13: the phrases the wording check found, if that's what held it. */
  phrases: readonly string[];
  lettingUrl: string;
}): AccountEmail {
  return {
    subject: `${input.address} is waiting for a check before it goes on gaff.ie`,
    button: 'Open the letting',
    text: [
      'Hello,',
      '',
      `Gaff checks every home before it goes on gaff.ie, and something about ${input.address} needs a person to look at it. Nobody has decided anything about it yet.`,
      '',
      ...(input.phrases.length > 0
        ? [
            `These words in what renters read about it may not be fair to everyone who could apply: ${quoted(input.phrases)}. You can change them while you wait.`,
            '',
          ]
        : []),
      'Until then, it has no page on gaff.ie and isn’t in search. Gaff isn’t answering its enquiries: they wait, and are answered once it’s on gaff.ie.',
      '',
      input.lettingUrl,
      '',
      `A person on Gaff’s team will look at it by ${input.lookBy}. If it’s fine, it goes on gaff.ie straight away, and we’ll email you either way.`,
      '',
      'Gaff',
    ].join('\n'),
  };
}

/** M98: a person released a home the checks held. */
export function listingClearedEmail(input: { address: string; lettingUrl: string }): AccountEmail {
  return {
    subject: `${input.address} is on gaff.ie now`,
    button: 'Open the letting',
    text: [
      'Hello,',
      '',
      `A person on Gaff’s team has checked ${input.address}, and it’s on gaff.ie now, with its page and its place in search.`,
      '',
      'Gaff is answering its enquiries, starting with anyone who enquired while it waited.',
      '',
      input.lettingUrl,
      '',
      'There’s nothing you need to do.',
      '',
      'Gaff',
    ].join('\n'),
  };
}

/**
 * M98: a person kept a home the checks held off gaff.ie, with the statement of reasons: what,
 * why, the facts relied on, what it rests on, who and when, and how to appeal.
 */
export function listingNotShownEmail(input: {
  address: string;
  reason: ReportReason;
  facts: readonly CaseFact[];
  decidedOn: string;
  reasonWords: string;
  lettingUrl: string;
}): AccountEmail {
  return {
    subject: `${input.address} won’t go on gaff.ie for now`,
    button: 'Open the letting',
    text: [
      'Hello,',
      '',
      `Gaff’s team has checked ${input.address}, and it won’t go on gaff.ie for now: ${input.reasonWords}.`,
      '',
      `What we relied on: ${factsInWords(input.facts)}. This rests on ${reasonGrounds[input.reason]}. A person on Gaff’s team decided this on ${input.decidedOn}.`,
      '',
      whileOff,
      '',
      'If you think we got it wrong, or once you’ve put right anything that needs it, press “Ask Gaff to look again” on the letting. You can ask once, within six months.',
      '',
      input.lettingUrl,
      '',
      'A different person on Gaff’s team will look within one working day of your asking, and email you.',
      '',
      'Gaff',
    ].join('\n'),
  };
}

/**
 * M107, M98: a person paused a lister's listings, with the statement of reasons, what it means,
 * and how to appeal. To the organisation's admins.
 */
export function listingsPausedEmail(input: {
  listerName: string;
  reason: ReportReason;
  facts: readonly CaseFact[];
  decidedOn: string;
  reasonWords: string;
  pausedUrl: string;
}): AccountEmail {
  return {
    subject: 'Your listings on gaff.ie are paused',
    button: 'See why',
    text: [
      'Hello,',
      '',
      `Gaff’s team has paused ${input.listerName}’s listings on gaff.ie after a case about one of its homes: ${input.reasonWords}.`,
      '',
      `What we relied on: ${factsInWords(input.facts)}. This rests on ${reasonGrounds[input.reason]}. A person on Gaff’s team decided this on ${input.decidedOn}.`,
      '',
      'While they’re paused, none of your homes is on gaff.ie and no new home goes live. The homes you have live carry on with the people already in them.',
      '',
      'If you think we got it wrong, press “Ask Gaff to look again”. You can ask once, within six months.',
      '',
      input.pausedUrl,
      '',
      'A different person on Gaff’s team will look within one working day of your asking, and email you.',
      '',
      'Gaff',
    ].join('\n'),
  };
}

/** M107: the pause is lifted, by a person or on appeal. */
export function pauseLiftedEmail(input: { listerName: string; lettingsUrl: string }): AccountEmail {
  return {
    subject: 'Your listings are back on gaff.ie',
    button: 'Open your lettings',
    text: [
      'Hello,',
      '',
      `Gaff’s team has lifted the pause on ${input.listerName}’s listings. Your live homes are back on gaff.ie, and you can put new homes live again.`,
      '',
      input.lettingsUrl,
      '',
      'There’s nothing you need to do.',
      '',
      'Gaff',
    ].join('\n'),
  };
}

/** M98: the answer to an appeal that keeps the pause, with its own statement. */
export function pauseKeptEmail(input: {
  listerName: string;
  reason: ReportReason;
  facts: readonly CaseFact[];
  decidedOn: string;
  reasonWords: string;
  pausedUrl: string;
}): AccountEmail {
  return {
    subject: 'Your listings stay paused',
    button: 'See why',
    text: [
      'Hello,',
      '',
      `A different person on Gaff’s team has looked again, as you asked, and ${input.listerName}’s listings stay paused: ${input.reasonWords}.`,
      '',
      `What we relied on: ${factsInWords(input.facts)}. This rests on ${reasonGrounds[input.reason]}. A person on Gaff’s team decided this on ${input.decidedOn}.`,
      '',
      'You can’t ask Gaff to look again a second time. You can take it to an out-of-court dispute settlement body certified under the EU Digital Services Act, or to the courts.',
      '',
      input.pausedUrl,
      '',
      'The homes you have live carry on with the people already in them. Nothing more happens unless you take it further.',
      '',
      'Gaff',
    ].join('\n'),
  };
}
