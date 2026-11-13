'use server';

import { redirect } from 'next/navigation';
import { env } from '@/lib/env';
import { recordProviderResult } from '@/server/checks/checks';

/** Development stand-in for the income check: the tester picks the result. */
export async function standInResultAction(
  checkId: string,
  returnUrl: string,
  formData: FormData,
): Promise<void> {
  if (!env().DEV_TOOLS) throw new Error('Dev tools are off');
  const outcome = String(formData.get('outcome') ?? '');
  const euro = Number(String(formData.get('monthlyIncome') ?? '').replace(/[€,\s]/g, ''));
  await recordProviderResult(
    checkId,
    outcome === 'pass' && euro > 0
      ? { confirmed: true, monthlyIncomeCents: Math.round(euro * 100) }
      : {
          confirmed: false,
          reason: outcome === 'no_regular_income' ? 'no_regular_income' : 'gave_up',
        },
  );
  // Only back to Gaff's own pages: never an open redirect.
  redirect(returnUrl.startsWith(`${env().APP_URL}/`) ? returnUrl : '/checks/done');
}
