import type { ReportReason } from '@/domain/homes/report';

/**
 * UX-TS-4: the words a lister reads when Gaff's team has taken one of their homes off gaff.ie
 * after a report: on the letting's page, in its Needs you task, and on the page that asks Gaff
 * to look again. The email that tells them is in `account-emails.ts`. Plain, warm and short, no
 * blame, and each ends with what happens next.
 */

/** Why a home was taken off gaff.ie, as the lister is told it: after "after a report: ". */
export const hiddenReasons: Record<ReportReason, string> = {
  scam: 'it may not be a genuine listing',
  wrong_details: 'some of its details look wrong',
  unfair: 'its wording about who can apply may not be fair to everyone',
  something_else: 'something about it needs a closer look',
};

export const hiddenCopy = {
  /** Overview's Needs you. */
  task: {
    lead: (reason: ReportReason) =>
      `Gaff’s team took this home off gaff.ie after a report: ${hiddenReasons[reason]}. Its enquiries wait until it’s back.`,
    action: 'Ask Gaff to look again',
    looking:
      'Gaff’s team is looking at this home again, and will email you within one working day.',
    /** BA-9 (M97): the rules took it off on strong signs of a scam; a person hasn't looked. */
    held: 'Gaff’s rules took this home off gaff.ie automatically after reports that it may be a scam. A person on Gaff’s team will check it within four working hours, and email you.',
    /**
     * BA-10 (M48): the checks held it as it went public, for a person to look at. Nobody has
     * decided anything.
     */
    checking: (lookBy: string) =>
      `Gaff checks every home before it goes on gaff.ie, and a person on Gaff’s team is looking at this one. They’ll email you by ${lookBy}. Its enquiries wait until then.`,
    /** BA-10 (M98): a person kept a home the checks held off gaff.ie. */
    leadChecked: (reason: ReportReason) =>
      `Gaff’s team checked this home and kept it off gaff.ie: ${hiddenReasons[reason]}. Its enquiries wait until it’s on.`,
    /** BA-9 (M98): the appeal was decided, and it stays off. */
    final:
      'Gaff’s team looked again and this home stays off gaff.ie. Their email says why, and what you can do next.',
  },
  /** The Home view's "On gaff.ie". */
  onGaff: 'Not shown on gaff.ie: Gaff’s team took it off after a report.',
  /** BA-10: the Home view's "On gaff.ie", for a home the checks held. */
  onGaffChecked: 'Not shown on gaff.ie yet: a person on Gaff’s team is checking it.',
  /** BA-10: the Home view's "On gaff.ie", for a home a person kept off after checking it. */
  onGaffKept: 'Not shown on gaff.ie: Gaff’s team checked it and kept it off.',
  /** The page behind the task. */
  page: {
    title: 'This home is off gaff.ie for now',
    why: (reason: ReportReason, on: string) =>
      `Gaff’s team took it off gaff.ie on ${on} after a report: ${hiddenReasons[reason]}.`,
    /** BA-10: a home the checks held, which a person kept off. */
    whyChecked: (reason: ReportReason, on: string) =>
      `Gaff’s team checked it before it went on gaff.ie, and on ${on} kept it off: ${hiddenReasons[reason]}.`,
    /** BA-9 (M98): the statement of reasons, as the email gave it. */
    reliedOn: (facts: string) => `What we relied on: ${facts}.`,
    meanwhile:
      'While it’s off, it has no page and isn’t in search. Gaff isn’t answering its enquiries: they wait, and are answered when it’s back.',
    fix: 'If you think we got it wrong, or once you’ve put right anything that needs it in the home’s details, ask us to look again. You can ask once.',
    change: 'Change the home’s details',
    next: 'A different person on Gaff’s team will look within one working day, and email you.',
    button: 'Ask Gaff to look again',
    asking: 'Asking…',
    back: 'Back to the letting',
  },
} as const;

/**
 * BA-10 (M107, M98): the page a lister reads when Gaff's team has paused their listings, with the
 * statement of reasons they were emailed, and "Ask Gaff to look again", once.
 */
export const pausedCopy = {
  title: 'Your listings are paused',
  why: (reason: ReportReason, on: string) =>
    `Gaff’s team paused your listings on gaff.ie on ${on}, after a case about one of your homes: ${hiddenReasons[reason]}.`,
  reliedOn: (facts: string) => `What we relied on: ${facts}.`,
  meanwhile:
    'While they’re paused, none of your homes is on gaff.ie and no new home goes live. The homes you have live carry on with the people already in them.',
  fix: 'If you think we got it wrong, ask us to look again. You can ask once.',
  next: 'A different person on Gaff’s team will look within one working day, and email you.',
  button: 'Ask Gaff to look again',
  asking: 'Asking…',
  back: 'Back to your lettings',
  /** After asking. */
  asked: 'Gaff’s team is looking at the pause again, and will email you within one working day.',
  /** After an appeal that kept it. */
  kept: 'Gaff’s team looked again and your listings stay paused. Their email says why, and what you can do next.',
} as const;
