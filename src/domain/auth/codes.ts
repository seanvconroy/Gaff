/**
 * UX-SI-2: the rules of a one-time code, as pure functions. The same rules hold wherever a code
 * is used: signing in, confirming it's you again (UX-SI-10), and opening a private link's
 * sensitive page (UX-SI-12). Storing and sending are in src/server/auth/codes.ts.
 */

export const CODE_LENGTH = 6;
/** A code lasts 10 minutes from when it's sent. */
export const CODE_LASTS_MINUTES = 10;
/** A code allows five tries. The fifth wrong one finishes it. */
export const CODE_TRIES = 5;
/** "Send a new code" unlocks this long after the last one went. */
export const RESEND_AFTER_SECONDS = 30;
/**
 * At most this many codes to one address, for one purpose, in any CODE_LASTS_MINUTES. It stops
 * someone filling another person's inbox by typing their address over and over.
 */
export const CODES_PER_WINDOW = 5;

export interface CodeFacts {
  expiresAt: Date;
  /** Wrong tries so far. */
  attempts: number;
  usedAt: Date | null;
}

export function codeExpiry(sentAt: Date): Date {
  return new Date(sentAt.getTime() + CODE_LASTS_MINUTES * 60_000);
}

export type CodeStanding = 'open' | 'expired' | 'tries_used' | 'used';

/** Whether a code can still be tried. Anything but `open` reads as "That code has expired." */
export function codeStanding(code: CodeFacts, now: Date): CodeStanding {
  if (code.usedAt) return 'used';
  if (code.attempts >= CODE_TRIES) return 'tries_used';
  if (now.getTime() >= code.expiresAt.getTime()) return 'expired';
  return 'open';
}

export interface CodeJudgement {
  /**
   * `correct`: let them in, and the code is used. `wrong`: say so, and they may try again.
   * `finished`: the code has expired or run out of tries, and only a new code will do.
   */
  result: 'correct' | 'wrong' | 'finished';
  /** Wrong tries to store after this one. */
  attempts: number;
}

/** One try at a code. `matches` is whether what was typed is the code that was sent. */
export function judgeCode(code: CodeFacts, matches: boolean, now: Date): CodeJudgement {
  if (codeStanding(code, now) !== 'open') return { result: 'finished', attempts: code.attempts };
  if (matches) return { result: 'correct', attempts: code.attempts };
  const attempts = code.attempts + 1;
  return { result: attempts >= CODE_TRIES ? 'finished' : 'wrong', attempts };
}

/** How long until "Send a new code" unlocks: whole seconds, counting down from 30 to 0. */
export function secondsUntilResend(sentAt: Date, now: Date): number {
  const waited = Math.max(0, (now.getTime() - sentAt.getTime()) / 1000);
  return Math.max(0, Math.ceil(RESEND_AFTER_SECONDS - waited));
}

/** Whether another code may go to an address that has had this many in the last ten minutes. */
export function canSendAnother(sentInWindow: number): boolean {
  return sentInWindow < CODES_PER_WINDOW;
}

/**
 * Six digits from random bytes, every code as likely as any other. Four bytes at a time are read
 * as a number; one too high to divide evenly into a million is skipped (about one in 4,000).
 */
export function codeFromBytes(bytes: Uint8Array): string {
  const codes = 10 ** CODE_LENGTH;
  const limit = Math.floor(0x1_0000_0000 / codes) * codes;
  for (let at = 0; at + 4 <= bytes.length; at += 4) {
    const value =
      bytes[at]! * 0x100_0000 + bytes[at + 1]! * 0x1_0000 + bytes[at + 2]! * 0x100 + bytes[at + 3]!;
    if (value < limit) return String(value % codes).padStart(CODE_LENGTH, '0');
  }
  throw new Error('Not enough random bytes for a code');
}
