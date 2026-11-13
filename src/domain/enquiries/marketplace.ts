import { z } from 'zod';
import { renterAnswersSchema, type RenterAnswers } from '@/domain/criteria/answers';
import type { Criteria } from '@/domain/criteria/criteria';
import { normalisePhone } from './parse';

/**
 * M76 to M82: enquiring on Gaff. The sheet asks only the letter's own criteria questions
 * (rule 2), an optional message and contact details. Fair-use limits stop mass enquiries
 * without slowing real renters (M82).
 */

/** M82: real renters rarely enquire about more than a few homes a day. */
export const ENQUIRIES_PER_DAY = 30;

export function fairUseProblem(enquiriesInLastDay: number): string | null {
  return enquiriesInLastDay >= ENQUIRIES_PER_DAY
    ? `You’ve enquired about ${ENQUIRIES_PER_DAY} homes today, which is as many as Gaff allows in a day. You can enquire about more tomorrow.`
    : null;
}

/** M52: enquiries close at a number set in advance, the same for everyone. */
export function enquiryLimitReached(enquiries: number, limit: number | null): boolean {
  return limit !== null && enquiries >= limit;
}

export interface EnquiryInput {
  fullName: string;
  mobile: string | null;
  message: string;
  keepDetails: boolean;
  answers: RenterAnswers;
}

const fullName = z
  .string()
  .trim()
  .min(2, 'Enter your name, as you’d like the letter to see it')
  .max(120, 'Keep your name under 120 characters');

/** Reads the enquiry sheet. Only the questions this letter's criteria need are read. */
export function readEnquiry(
  values: Record<string, string>,
  criteria: Criteria,
  now = new Date(),
): { ok: true; enquiry: EnquiryInput } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const name = fullName.safeParse(values.fullName ?? '');
  if (!name.success) errors.fullName = name.error.issues[0]!.message;
  const rawMobile = (values.mobile ?? '').trim();
  const mobile = rawMobile ? normalisePhone(rawMobile) : null;
  if (rawMobile && !mobile)
    errors.mobile = 'Enter a mobile number, like 087 123 4567, or leave it blank';
  const message = (values.message ?? '').trim();
  if (message.length > 2000) errors.message = 'Keep your message under 2,000 characters';
  const answers = renterAnswersSchema(criteria, now).safeParse(values);
  if (!answers.success) {
    for (const issue of answers.error.issues)
      errors[String(issue.path[0] ?? 'form')] ??= issue.message;
  }
  if (Object.keys(errors).length || !name.success || !answers.success) return { ok: false, errors };
  return {
    ok: true,
    enquiry: {
      fullName: name.data,
      mobile: rawMobile ? rawMobile : null,
      message,
      keepDetails: values.keepDetails === 'yes',
      answers: answers.data,
    },
  };
}

/** M81: a renter can withdraw until they're offered the home; then they decline the offer. */
export const withdrawableStatuses = [
  'enquired',
  'invited',
  'waitlisted',
  'not_invited',
  'booked',
  'attended',
  'no_show',
  'applied',
  'preferred',
  'backup',
] as const;
export type WithdrawableStatus = (typeof withdrawableStatuses)[number];

export function canWithdraw(status: string): status is WithdrawableStatus {
  return (withdrawableStatuses as readonly string[]).includes(status);
}
