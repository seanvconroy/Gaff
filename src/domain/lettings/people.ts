import { lettingPageCopy } from '@/copy/letting-page';
import { meetsWords } from '@/copy/decisions';
import { formatDateTime } from '@/lib/format';
import type { Stage } from './stages';

/**
 * People on a letting's page (UX-LP-8 to UX-LP-10): one list of everyone who enquired about the
 * home, in the order Gaff already ranks them (R10), with nobody hidden or dropped (UX-MT-8).
 * Each row is a name, one line saying where they stand, and a status. Filter chips change with
 * the stage. People shows; it decides nothing (rule 1): decisions are made in their own flows.
 *
 * Only what each stage has collected is shown (rule 2): the answers before viewing, income once
 * they've applied. Nothing here is a score or a recommendation (Q36).
 */

const copy = lettingPageCopy.people;

export type ApplicationStatus =
  | 'enquired'
  | 'invited'
  | 'waitlisted'
  | 'not_invited'
  | 'booked'
  | 'attended'
  | 'no_show'
  | 'withdrawn'
  | 'applied'
  | 'preferred'
  | 'backup'
  | 'offered'
  | 'accepted'
  | 'declined'
  | 'not_chosen';

export interface PersonFacts {
  id: string;
  name: string;
  status: ApplicationStatus;
  /** From the ranking: criteria met of those asked, and whether they've answered. */
  met: number;
  total: number;
  answered: boolean;
  enquiredAt: Date;
  answeredAt: Date | null;
  /** Their viewing: the time, and whether they came. Null if they haven't booked one. */
  booking: { startsAt: Date; status: 'booked' | 'attended' | 'no_show' | 'cancelled' } | null;
  waitlistPosition: number | null;
  appliedAt: Date | null;
  /** Stage 5 onwards, once they've applied: whether their income meets the operator's rule. */
  meetsIncomeRule: boolean | null;
  /** Retention has deleted their details: only the record of what happened stays. */
  deleted: boolean;
}

/** Which list People shows: what the stage has collected decides the chips and the line. */
export type PeopleGroup = 'enquiries' | 'viewings' | 'applications';

export function peopleGroup(stage: Stage): PeopleGroup {
  switch (stage) {
    case 'setup':
    case 'enquiries':
    case 'shortlist':
      return 'enquiries';
    case 'viewings':
      return 'viewings';
    default:
      return 'applications';
  }
}

export type PeopleChip =
  'all' | 'answered' | 'not_yet' | 'invited' | 'waitlist' | 'applied' | 'chosen' | 'others';

/** UX-LP-8: the chips for the stage. "All" comes first, so the list opens on everyone. */
export const chipsFor: Record<PeopleGroup, readonly PeopleChip[]> = {
  enquiries: ['all', 'answered', 'not_yet'],
  viewings: ['all', 'invited', 'waitlist', 'others'],
  applications: ['all', 'applied', 'chosen', 'others'],
};

const viewingStatuses: readonly ApplicationStatus[] = ['invited', 'booked', 'attended', 'no_show'];
const chosenStatuses: readonly ApplicationStatus[] = ['preferred', 'backup', 'offered', 'accepted'];

export function inChip(person: PersonFacts, chip: PeopleChip, group: PeopleGroup): boolean {
  switch (chip) {
    case 'all':
      return true;
    case 'answered':
      return person.answeredAt !== null;
    case 'not_yet':
      return person.answeredAt === null;
    case 'invited':
      return viewingStatuses.includes(person.status);
    case 'waitlist':
      return person.status === 'waitlisted';
    case 'applied':
      return person.status === 'applied';
    case 'chosen':
      return chosenStatuses.includes(person.status);
    case 'others':
      return !chipsFor[group]
        .filter((c) => c !== 'all' && c !== 'others')
        .some((c) => inChip(person, c, group));
  }
}

/** The chip in the address, or "All" for anything that isn't one of the stage's. */
export function chosenChip(value: string | undefined, group: PeopleGroup): PeopleChip {
  return chipsFor[group].find((chip) => chip === value) ?? 'all';
}

/** Everyone under a chip, in the order they came: the ranking's. Nobody is moved. */
export function peopleIn<T extends PersonFacts>(
  people: readonly T[],
  chip: PeopleChip,
  group: PeopleGroup,
): T[] {
  return people.filter((person) => inChip(person, chip, group));
}

const ordinal = (n: number) => {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
};

function viewingLine(person: PersonFacts, now: Date): string | null {
  if (person.booking?.status === 'attended') return 'Came to view';
  if (person.booking?.status === 'no_show') return 'Didn’t come to the viewing';
  if (person.booking?.status === 'booked') {
    return `Booked ${formatDateTime(person.booking.startsAt, now)}`;
  }
  if (person.status === 'invited') return 'Invited, not booked yet';
  if (person.status === 'waitlisted') {
    return person.waitlistPosition
      ? `On the waiting list, ${ordinal(person.waitlistPosition)}`
      : 'On the waiting list';
  }
  return null;
}

/** UX-LP-8: where they stand, in one line ("Meets 4 of 4", "Booked Friday 20 November, 6pm"). */
export function standLine(person: PersonFacts, group: PeopleGroup, now: Date = new Date()): string {
  if (person.deleted) return copy.sheet.deleted;
  if (person.status === 'withdrawn') return 'Withdrew their enquiry';
  const fit = meetsWords(person);
  if (group === 'enquiries') return fit;
  if (group === 'applications' && person.appliedAt) {
    if (person.meetsIncomeRule === null) return 'Applied';
    return person.meetsIncomeRule
      ? 'Applied. Income meets your rule'
      : 'Applied. Income is below your rule';
  }
  return viewingLine(person, now) ?? fit;
}

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning';

/** The status beside each person, in words. Never `danger` (design system). */
export const statusWords: Record<ApplicationStatus, { tone: StatusTone; words: string }> = {
  enquired: { tone: 'neutral', words: 'Enquired' },
  invited: { tone: 'info', words: 'Invited' },
  waitlisted: { tone: 'neutral', words: 'Waiting list' },
  not_invited: { tone: 'neutral', words: 'Not invited' },
  booked: { tone: 'info', words: 'Booked' },
  attended: { tone: 'success', words: 'Came' },
  no_show: { tone: 'neutral', words: 'Didn’t come' },
  withdrawn: { tone: 'neutral', words: 'Withdrew' },
  applied: { tone: 'info', words: 'Applied' },
  preferred: { tone: 'success', words: 'Chosen' },
  backup: { tone: 'info', words: 'Backup' },
  offered: { tone: 'info', words: 'Offered' },
  accepted: { tone: 'success', words: 'Accepted' },
  declined: { tone: 'neutral', words: 'Didn’t take it' },
  not_chosen: { tone: 'neutral', words: 'Not chosen' },
};

const outcomes: Partial<Record<ApplicationStatus, string>> = {
  waitlisted: 'Put on the waiting list',
  not_invited: 'Told they weren’t invited this time',
  preferred: 'Chosen as your preferred applicant',
  backup: 'Chosen as your backup',
  offered: 'Offered the home',
  accepted: 'Accepted the offer',
  declined: 'Didn’t take the offer',
  not_chosen: 'Told the home went to someone else',
  withdrawn: 'Withdrew their enquiry',
};

/** UX-LP-9: what's happened with this person, in order, from what Gaff holds. */
export function personHistory(person: PersonFacts, now: Date = new Date()): string[] {
  const lines = [`Enquired ${formatDateTime(person.enquiredAt, now)}`];
  if (person.answeredAt)
    lines.push(`Answered the questions ${formatDateTime(person.answeredAt, now)}`);
  const invited =
    person.booking !== null ||
    ['invited', ...viewingStatuses].includes(person.status) ||
    person.appliedAt !== null;
  if (invited) lines.push('Invited to view');
  if (person.booking && person.booking.status !== 'cancelled') {
    lines.push(`Booked a viewing for ${formatDateTime(person.booking.startsAt, now)}`);
    if (person.booking.status === 'attended') lines.push('Came to view');
    if (person.booking.status === 'no_show') lines.push('Didn’t come to the viewing');
  }
  if (person.appliedAt) lines.push(`Applied ${formatDateTime(person.appliedAt, now)}`);
  const outcome = outcomes[person.status];
  if (outcome && !(person.status === 'waitlisted' && invited)) lines.push(outcome);
  return lines;
}
