'use server';

import { CODE_LENGTH, secondsUntilResend } from '@/domain/auth/codes';
import { sensitiveActionSchema, type SensitiveAction } from '@/domain/auth/confirm';
import { finishConfirmation, startConfirmation } from '@/server/auth/confirm-request';
import { currentUser } from '@/server/auth/member';

/** What the "Confirm it's you" sheet hears back after asking for a code. */
export type ConfirmCodeSent =
  | { sent: true; resendIn: number }
  | { sent: false; reason: 'too_many' | 'not_sent' | 'signed_out' }
  /** AU12: too many tries from this network address. */
  | { sent: false; reason: 'slow_down'; retryAfterSeconds: number };

/** UX-SI-10: emails the signed-in person a fresh code, to confirm it's them for this action. */
export async function sendConfirmCode(action: SensitiveAction): Promise<ConfirmCodeSent> {
  const parsed = sensitiveActionSchema.safeParse(action);
  const user = await currentUser();
  if (!parsed.success || !user) return { sent: false, reason: 'signed_out' };
  const now = new Date();
  const result = await startConfirmation(user, parsed.data);
  if (result.sent) return { sent: true, resendIn: secondsUntilResend(now, now) };
  // One went a moment ago and still stands.
  if (result.reason === 'wait') {
    return { sent: true, resendIn: secondsUntilResend(result.sentAt, now) };
  }
  if (result.reason === 'slow_down') return result;
  return { sent: false, reason: result.reason };
}

/** UX-SI-10: one try at the code. The right one leaves this browser holding the confirmation. */
export async function checkConfirmCode(
  action: SensitiveAction,
  code: string,
): Promise<'correct' | 'wrong' | 'finished' | 'slow_down'> {
  const parsed = sensitiveActionSchema.safeParse(action);
  const user = await currentUser();
  if (!parsed.success || !user) return 'finished';
  const digits = String(code).replace(/\D/g, '');
  // A half-typed code isn't a try: nothing is counted against the code.
  if (digits.length !== CODE_LENGTH) return 'wrong';
  return finishConfirmation(user, parsed.data, digits);
}
