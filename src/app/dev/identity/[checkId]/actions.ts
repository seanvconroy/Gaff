'use server';

import { redirect } from 'next/navigation';
import { env } from '@/lib/env';
import { recordIdentityOutcome } from '@/server/identity/identity';
import { standInIdentityCheck } from '@/server/identity/stand-in';

/** Development stand-in for Stripe Identity: the tester picks the result. */
export async function standInIdentityAction(
  checkId: string,
  returnUrl: string,
  formData: FormData,
): Promise<void> {
  const config = env();
  if (!config.DEV_TOOLS || config.IDENTITY_PROVIDER !== 'stand_in') {
    throw new Error('The identity stand-in is off');
  }
  const check = await standInIdentityCheck(checkId);
  if (!check) throw new Error('No such check');
  const outcome = String(formData.get('outcome') ?? '');
  await recordIdentityOutcome({
    checkId,
    userId: check.userId,
    outcome:
      outcome === 'pass'
        ? {
            status: 'passed',
            verifiedName: {
              first: String(formData.get('firstName') ?? '').slice(0, 60),
              last: String(formData.get('lastName') ?? '').slice(0, 60),
            },
          }
        : outcome === 'declined'
          ? { status: 'failed', reason: 'gave_up', consentDeclined: true }
          : {
              status: 'failed',
              reason: outcome === 'face_mismatch' ? 'face_mismatch' : 'document',
            },
  });
  const back = new URL(returnUrl, config.APP_URL);
  redirect(back.origin === new URL(config.APP_URL).origin ? `${back.pathname}${back.search}` : '/');
}
