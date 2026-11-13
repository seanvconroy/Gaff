/**
 * AU2, AU3, AU5: 6-digit codes sent by email, to sign in, confirm an email or reset a password.
 * A code works for 10 minutes and allows 5 tries; a new one can be sent after a minute. Codes
 * can be pasted with spaces or a dash (WCAG 3.3.8: no retyping, no puzzles).
 */

export const CODE_MINUTES = 10;
export const CODE_TRIES = 5;
export const RESEND_SECONDS = 60;

/** The six digits in what was typed, or null. Spaces and dashes are ignored. */
export function readCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const digits = input.replace(/[\s -]/g, '');
  return /^\d{6}$/.test(digits) ? digits : null;
}

export function canResendCode(lastSentAt: Date | null, now: Date): boolean {
  return !lastSentAt || now.getTime() - lastSentAt.getTime() >= RESEND_SECONDS * 1000;
}
