'use server';

import { redirect } from 'next/navigation';
import { env } from '@/lib/env';
import { recordIdentityOutcome } from '@/server/verification/identity';

/** Development stand-in for Stripe Identity: the tester picks the result. */
export async function standInIdentityAction(
  organisationId: string,
  checkId: string,
  returnUrl: string,
  formData: FormData,
): Promise<void> {
  const config = env();
  if (!config.DEV_TOOLS || config.LETTER_IDENTITY_PROVIDER !== 'stand_in') {
    throw new Error('The identity stand-in is off');
  }
  const outcome = String(formData.get('outcome') ?? '');
  await recordIdentityOutcome({
    organisationId,
    checkId,
    outcome:
      outcome === 'pass'
        ? {
            status: 'passed',
            verifiedName: String(formData.get('verifiedName') ?? '').slice(0, 120),
          }
        : { status: 'failed', reason: outcome === 'face_mismatch' ? 'face_mismatch' : 'document' },
  });
  const back = new URL(returnUrl, config.APP_URL);
  redirect(back.origin === new URL(config.APP_URL).origin ? `${back.pathname}${back.search}` : '/');
}
