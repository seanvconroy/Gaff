'use server';

import { enterGateCode, sendGateCode } from '@/server/renter/gate';

export type SendCodeState =
  | { sent: true; sentTo: string; again: boolean }
  | { sent: false; problem: 'tooMany' | 'notSent' | 'link' };

/** UX-RN-14, UX-SI-12: emails the one-time code to the address on the application. */
export async function sendCodeAction(token: string): Promise<SendCodeState> {
  const result = await sendGateCode(token);
  if (result.sent) return result;
  return {
    sent: false,
    problem:
      result.reason === 'too_many' ? 'tooMany' : result.reason === 'no_link' ? 'link' : 'notSent',
  };
}

/** One try at the code. The right one opens the guarded pages in this browser. */
export async function enterCodeAction(
  token: string,
  code: string,
): Promise<'correct' | 'wrong' | 'expired'> {
  const result = await enterGateCode(token, code);
  return result === 'finished' ? 'expired' : result;
}
