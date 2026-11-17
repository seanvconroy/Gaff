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
  },
  /** The Home view's "On gaff.ie". */
  onGaff: 'Not shown on gaff.ie: Gaff’s team took it off after a report.',
  /** The page behind the task. */
  page: {
    title: 'This home is off gaff.ie for now',
    why: (reason: ReportReason, on: string) =>
      `Gaff’s team took it off gaff.ie on ${on} after a report: ${hiddenReasons[reason]}.`,
    meanwhile:
      'While it’s off, it has no page and isn’t in search. Gaff isn’t answering its enquiries: they wait, and are answered when it’s back.',
    fix: 'Put right anything that needs it in the home’s details, then ask us to look again.',
    change: 'Change the home’s details',
    next: 'Gaff’s team will look within one working day and email you when it’s back.',
    button: 'Ask Gaff to look again',
    asking: 'Asking…',
    back: 'Back to the letting',
  },
} as const;
