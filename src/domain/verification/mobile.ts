/**
 * M3: confirming a mobile number with a 6-digit code by SMS. Codes last 10 minutes and allow
 * 5 tries; a new code can be sent after 30 seconds, and at most 5 a day.
 */

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const RESEND_AFTER_MS = 30 * 1000;
export const MAX_SENDS_PER_DAY = 5;

/** "087 123 4567", "+353 87 123 4567" or "00353871234567" → "+353871234567"; null otherwise. */
export function normaliseMobile(input: string): string | null {
  let digits = input.replace(/[\s()-]/g, '');
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;
  if (/^08[35679]\d{7}$/.test(digits)) return `+353${digits.slice(1)}`;
  if (/^\+3538[35679]\d{7}$/.test(digits)) return digits;
  // Elsewhere: an international number, for letters and renters based abroad.
  if (/^\+(?!353)[1-9]\d{7,14}$/.test(digits)) return digits;
  return null;
}

/** "+353871234567" → "087 ••• 4567": enough to recognise, not enough to copy. */
export function maskMobile(phone: string): string {
  const local = phone.startsWith('+353') ? `0${phone.slice(4)}` : phone;
  return `${local.slice(0, 3)} ••• ${local.slice(-4)}`;
}

export type SendDecision = { ok: true } | { ok: false; reason: 'too_soon' | 'too_many' };

export function canSendCode(
  state: { lastSentAt: Date | null; sendsToday: number },
  now: Date,
): SendDecision {
  if (state.lastSentAt && now.getTime() - state.lastSentAt.getTime() < RESEND_AFTER_MS) {
    return { ok: false, reason: 'too_soon' };
  }
  const sameDay = state.lastSentAt && state.lastSentAt.toDateString() === now.toDateString();
  if (sameDay && state.sendsToday >= MAX_SENDS_PER_DAY) return { ok: false, reason: 'too_many' };
  return { ok: true };
}

export type CodeCheck = 'ok' | 'wrong' | 'expired' | 'locked' | 'none';

export function checkCode(
  state: { codeHash: string | null; codeExpiresAt: Date | null; attempts: number },
  givenHash: string,
  now: Date,
): CodeCheck {
  if (!state.codeHash || !state.codeExpiresAt) return 'none';
  if (state.attempts >= MAX_ATTEMPTS) return 'locked';
  if (state.codeExpiresAt < now) return 'expired';
  return state.codeHash === givenHash ? 'ok' : 'wrong';
}
