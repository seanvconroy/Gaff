import { z } from 'zod';
import type { CheckKind, CheckStatus } from '@/domain/checks/checks';
import type { DirectStepCode } from './catalogue';

/**
 * UX-ME-1: what a funnel event may hold. The step is a code from the catalogue, the subject is
 * an ID, the split is a code, and the payload is numbers and yes/no values only. There is no
 * field a name, a contact detail or a sentence could go in (rule 8, ADR-0006).
 */
export const funnelVariantSchema = z.enum([
  // Sign-in methods. Email links are today's; the rest come with the redesigned sign-in.
  'email_link',
  'email_code',
  'google',
  'apple',
  'passkey',
  // Kinds of organisation, for first run.
  'agency',
  'landlord',
  // How a letting was started.
  'import',
  'form',
  // Where an enquiry came from.
  'daft',
  'myhome',
  'gaff',
  // Search results; first taps on Today; with or without a profile; what a renter was offered.
  'fit',
  'no_fit',
  'needs_you',
  'other',
  'new',
  'with_profile',
  'details',
  'identity',
]);
export type FunnelVariant = z.infer<typeof funnelVariantSchema>;

/**
 * A step's payload: counts only, each one named here, as the record's event payloads are
 * (src/server/record/events.ts). A new measure adds a field; nothing here can hold text.
 */
export const funnelDataSchema = z.strictObject({
  /** Import: how many fields the person changed on review. */
  fieldsChanged: z.number().int().min(0).optional(),
});
export type FunnelData = z.infer<typeof funnelDataSchema>;

export const funnelSubjectSchema = z.uuid();

/**
 * UX-ME-4: a renter's page records only that a step was reached and when. Which step depends on
 * what the page is showing them: the questions, the viewing times, or the application.
 */
export function renterPageStep(page: {
  status: string;
  /** The questions are shown and can still be answered. */
  canAnswer: boolean;
  /** Someone on the waiting list has been offered a place they can book. */
  hasPlaceOffer: boolean;
}): DirectStepCode | null {
  if (page.status === 'enquired') return page.canAnswer ? 'renter_questions.page_opened' : null;
  if (page.status === 'invited') return 'renter_booking.opened';
  if (page.status === 'waitlisted') return page.hasPlaceOffer ? 'renter_booking.opened' : null;
  if (page.status === 'attended') return 'renter_applying.opened';
  return null;
}

type Check = { kind: CheckKind; status: CheckStatus };

const HAS_RESULT: readonly CheckStatus[] = ['passed', 'not_passed', 'not_needed'];
const BACK: readonly CheckStatus[] = [
  'passed',
  'not_passed',
  'answered',
  'no_answer',
  'not_needed',
];

/**
 * "All three done" for the renter: their ID and income checks have a result, and they've named
 * their referees (or said they have none). What a referee then does isn't the renter's step.
 */
export function renterChecksDone(checks: readonly Check[]): boolean {
  return (
    checks.length > 0 &&
    checks.every((check) =>
      check.kind === 'identity' || check.kind === 'income'
        ? HAS_RESULT.includes(check.status)
        : check.status !== 'to_do',
    )
  );
}

/** "Checks back" for the operator: every check has ended, referees' answers included. */
export function checksBack(checks: readonly Check[]): boolean {
  return checks.length > 0 && checks.every((check) => BACK.includes(check.status));
}
