import { daysSince } from '@/domain/dashboard/time';
import type { Stage } from '@/domain/lettings/stages';
import type { landlordNumbers } from './pseudonyms';

/**
 * The owner's page (UX-OP-1 to UX-OP-5; R27, Q4): one screen that answers "how is it going?".
 * These rules say where a letting stands, which figures belong to its stage, which steps of the
 * record are decisions, and which steps an owner is shown at all. They read counts, codes and
 * dates only: nothing here ever holds a renter's name, contact details or words (rule 2).
 */

export type OwnerNumbers = ReturnType<typeof landlordNumbers>;

export interface OwnerFacts {
  stage: Stage;
  status: 'draft' | 'live' | 'let' | 'withdrawn';
  numbers: OwnerNumbers;
  /** Places to book, across every viewing time. */
  places: number;
  /** How many people meet everything that was asked. Null where nothing was asked. */
  meetEverything: number | null;
  /** The chosen applicant's checks: how many are back. Null until someone is chosen. */
  checks: { done: number; total: number } | null;
  /** Where the owner's own approval stands for the people chosen now. */
  approval: 'not_asked' | 'asked' | 'approved' | 'declined';
  /** The latest offer, if one has been made. */
  offer: 'none' | 'open' | 'accepted' | 'declined' | 'expired';
}

/** Where the letting stands, as a code and the numbers its one sentence needs. */
export type Standing =
  | { code: 'setting_up' }
  | { code: 'no_enquiries' }
  | { code: 'enquiries'; enquiries: number }
  | { code: 'viewings'; booked: number; places: number }
  | { code: 'applications'; applied: number }
  | { code: 'checks' }
  | { code: 'approval_asked' }
  | { code: 'approved' }
  | { code: 'declined' }
  | { code: 'offer_out' }
  | { code: 'offer_not_taken' }
  | { code: 'let' }
  | { code: 'withdrawn' };

/**
 * UX-OP-1: the one sentence at the top of the page. It follows what has happened, the furthest
 * thing first: an offer that's out says so, whatever the stage's name is.
 */
export function whereItStands(facts: OwnerFacts): Standing {
  if (facts.status === 'withdrawn') return { code: 'withdrawn' };
  if (facts.status === 'let') return { code: 'let' };
  if (facts.status === 'draft' || facts.stage === 'setup') return { code: 'setting_up' };
  if (facts.offer === 'open') return { code: 'offer_out' };
  if (facts.approval === 'declined') return { code: 'declined' };
  if (facts.offer === 'declined' || facts.offer === 'expired') return { code: 'offer_not_taken' };
  if (facts.approval === 'approved') return { code: 'approved' };
  if (facts.approval === 'asked') return { code: 'approval_asked' };
  if (facts.stage === 'checks' || facts.stage === 'offer') return { code: 'checks' };
  if (facts.stage === 'applications') {
    return { code: 'applications', applied: facts.numbers.applied };
  }
  if (facts.stage === 'viewings') {
    return { code: 'viewings', booked: facts.numbers.booked, places: facts.places };
  }
  return facts.numbers.enquiries === 0
    ? { code: 'no_enquiries' }
    : { code: 'enquiries', enquiries: facts.numbers.enquiries };
}

export type FigureCode =
  | 'enquiries'
  | 'answered'
  | 'meet_everything'
  | 'invited'
  | 'booked'
  | 'waitlisted'
  | 'came'
  | 'applied'
  | 'checks_done';

export interface OwnerFigure {
  code: FigureCode;
  value: number;
  /** "8 of 14": what the value is out of, where that says more than the value alone. */
  of?: number;
}

export const MAX_FIGURES = 3;

/**
 * UX-OP-1: up to three figures, for the stage the letting is in. A figure for a stage that
 * hasn't come is never shown, so nothing reads as zero only because it's early. A let or
 * withdrawn home shows none: its page is a summary.
 */
export function ownerFigures(facts: OwnerFacts): OwnerFigure[] {
  const { numbers } = facts;
  if (facts.status !== 'live') return [];
  switch (facts.stage) {
    case 'setup':
    case 'tenancy':
    case 'close':
      return [];
    case 'enquiries':
    case 'shortlist':
      // "No enquiries yet" is the page's sentence. Three zeros under it would say nothing more.
      if (numbers.enquiries === 0) return [];
      return [
        { code: 'enquiries', value: numbers.enquiries },
        { code: 'answered', value: numbers.answered },
        ...(facts.meetEverything === null
          ? []
          : [{ code: 'meet_everything' as const, value: facts.meetEverything }]),
      ];
    case 'viewings':
      return [
        { code: 'invited', value: numbers.invited },
        { code: 'booked', value: numbers.booked, of: facts.places },
        numbers.came > 0
          ? { code: 'came', value: numbers.came }
          : { code: 'waitlisted', value: numbers.waitlisted },
      ];
    case 'applications':
      return [
        { code: 'came', value: numbers.came },
        { code: 'applied', value: numbers.applied },
      ];
    case 'checks':
    case 'offer':
      return [
        { code: 'came', value: numbers.came },
        { code: 'applied', value: numbers.applied },
        ...(facts.checks
          ? [{ code: 'checks_done' as const, value: facts.checks.done, of: facts.checks.total }]
          : []),
      ];
  }
}

/** One step of a letting's record, as the log holds it: a code, numbers and dates, and who. */
export interface RecordStep {
  id: number;
  type: string;
  data: Record<string, unknown>;
  at: Date;
  actorType: 'person' | 'ai' | 'system' | 'renter' | 'landlord' | 'staff';
  /** For a renter, the ID of their application. Never a name. */
  actorId: string | null;
  /** For a person at the agency, their name. */
  personName: string | null;
}

/**
 * "What's been decided" (section 5, "Following a letting"): decisions only. Each was made by a
 * person at the agency, by the owner, or by the renter the home was offered to.
 */
export const OWNER_DECISIONS = [
  'letting.went_live',
  'shortlist.decided',
  'applicants.chosen',
  'landlord.approval_answered',
  'offer.made',
  'offer.accepted',
  'offer.declined',
  'offer.expired',
  'agreement.signed',
  'letting.closed',
] as const;

/**
 * UX-OP-3: what the record shows an owner. It keeps enquiries, invitations, viewings,
 * applications and decisions. It is a list of what's kept, not of what's left out, so a step
 * Gaff adds later ("Fixed wording", "Answers drafted", a draft saved) stays out until someone
 * decides an owner should see it.
 */
export const OWNER_RECORD = [
  // Enquiries.
  'enquiry.received',
  'application.answered',
  // Invitations.
  'shortlist.decided',
  'waitlist.offered',
  // Viewings.
  'viewings.session_added',
  'viewings.session_removed',
  'viewing.booked',
  'viewing.cancelled',
  'viewing.attendance_marked',
  // Applications.
  'application.submitted',
  'applicants.chosen',
  // Decisions, and what came of them.
  'letting.went_live',
  'criteria.set',
  'letting.rent_changed',
  'landlord.approval_requested',
  'landlord.approval_answered',
  'offer.made',
  'offer.accepted',
  'offer.declined',
  'offer.expired',
  'agreement.signed',
  'tenancy.rtb_registered',
  'letting.closed',
  'letting.finished',
] as const;

/** UX-OP-1: the page fits on about one phone screen, so it shows the newest few decisions. */
export const DECISIONS_SHOWN = 3;

const newestFirst = (a: RecordStep, b: RecordStep) =>
  b.at.getTime() - a.at.getTime() || b.id - a.id;

/** The decisions made on a letting, newest first. */
export function ownerDecisions(steps: readonly RecordStep[]): RecordStep[] {
  const decisions: readonly string[] = OWNER_DECISIONS;
  return steps.filter((step) => decisions.includes(step.type)).sort(newestFirst);
}

/** UX-OP-3: the record as an owner sees it, newest first, without Gaff's internal steps. */
export function ownerRecord(steps: readonly RecordStep[]): RecordStep[] {
  const kept: readonly string[] = OWNER_RECORD;
  return steps.filter((step) => kept.includes(step.type)).sort(newestFirst);
}

export interface LetSummary {
  /** Whole days from the first enquiry to the day it was let. Null where nobody enquired. */
  daysToLet: number | null;
  rentCents: number;
  /** The day the tenancy starts. Null for a home closed as let outside Gaff. */
  startDate: string | null;
  rtbRegisteredAt: Date | null;
}

/**
 * UX-OP-5: once the home is let, the page is a summary: let in how many days, the rent, the
 * tenancy's start date, and when it was registered with the RTB. Days to let run from the first
 * enquiry to the signed agreement, as on the agent's own results (R28). Until it's signed, they
 * run to the day the offer was accepted, or the day the letting was closed as let.
 */
export function letSummary(input: {
  firstEnquiryAt: Date | null;
  signedAt: Date | null;
  acceptedAt: Date | null;
  closedAt: Date | null;
  askingRentCents: number;
  tenancy: { rentCents: number; startDate: string; rtbRegisteredAt: Date | null } | null;
}): LetSummary {
  const letAt = input.signedAt ?? input.acceptedAt ?? input.closedAt;
  return {
    daysToLet: input.firstEnquiryAt && letAt ? daysSince(input.firstEnquiryAt, letAt) : null,
    rentCents: input.tenancy?.rentCents ?? input.askingRentCents,
    startDate: input.tenancy?.startDate ?? null,
    rtbRegisteredAt: input.tenancy?.rtbRegisteredAt ?? null,
  };
}
