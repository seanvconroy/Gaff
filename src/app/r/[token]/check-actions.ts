'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { common } from '@/copy/renter';
import { formValues, invalid, type FormState } from '@/lib/forms';
import { cookieOptions } from '@/server/auth/cookies';
import { startProviderCheck, submitReferees } from '@/server/checks/checks';
import { loadRenterPage } from '@/server/renter/answers';
import { CHECK_RETURN_COOKIE, CHECK_RETURN_MINUTES } from '@/server/renter/check-return';
import { linkIsOpen } from '@/server/renter/gate';
import { toRenterPage } from './back';

/** UX-RN-14: nothing about the checks is done from a link alone. */
async function open(token: string): Promise<boolean> {
  const page = await loadRenterPage(token);
  return page !== null && (await linkIsOpen(token, page.application.email));
}

/**
 * R18: the renter starts their ID or income check with the provider. The provider is never
 * given their link: this browser remembers the way back for an hour (UX-RN-17).
 */
export async function startCheckAction(token: string, kind: 'identity' | 'income'): Promise<void> {
  if (!(await open(token))) toRenterPage(token);
  const started = await startProviderCheck(token, kind);
  if ('problem' in started) toRenterPage(token, `?check_problem=${started.problem}`);
  (await cookies()).set(CHECK_RETURN_COOKIE, token, cookieOptions(CHECK_RETURN_MINUTES * 60));
  redirect(started.redirectUrl);
}

/** R18, UX-RN-15: the renter names their referees, or says they don't have one. */
export async function refereesAction(
  token: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  if (!(await open(token))) toRenterPage(token);
  const result = await submitReferees(token, values);
  if (!result) return invalid({ form: common.linkEnded }, values);
  if (!result.ok) {
    if ('closed' in result) toRenterPage(token);
    return invalid(result.errors, values);
  }
  toRenterPage(token);
}
