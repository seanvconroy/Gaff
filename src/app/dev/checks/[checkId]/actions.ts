'use server';

import { redirect } from 'next/navigation';
import { env } from '@/lib/env';
import { recordProviderResult } from '@/server/checks/checks';
import { requireStandInCheck } from '@/server/dev/gate';

/**
 * Development stand-in for the ID check's provider: the tester picks the result. On the test
 * copy, the person whose check it is may, through their check's own link (BA-6).
 */
export async function standInResultAction(
  checkId: string,
  key: string | null,
  returnUrl: string,
  formData: FormData,
): Promise<void> {
  await requireStandInCheck(checkId, key);
  const outcome = String(formData.get('outcome') ?? '');
  await recordProviderResult(checkId, {
    kind: 'identity',
    result:
      outcome === 'pass'
        ? {
            verified: true,
            verifiedName: String(formData.get('verifiedName') ?? '').slice(0, 120),
          }
        : {
            verified: false,
            reason:
              outcome === 'document'
                ? 'document'
                : outcome === 'face_mismatch'
                  ? 'face_mismatch'
                  : 'gave_up',
          },
  });
  // Only back to Gaff's own pages: never an open redirect.
  redirect(returnUrl.startsWith(`${env().APP_URL}/`) ? returnUrl : '/checks/done');
}
