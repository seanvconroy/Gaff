'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { common } from '@/copy/renter';
import { formValues, invalid, type FormState } from '@/lib/forms';
import { cookieOptions } from '@/server/auth/cookies';
import { startProviderCheck, submitReferees } from '@/server/checks/checks';
import { requestSignInCode } from '@/server/auth/sign-in';
import { settleRenterIdentity } from '@/server/identity/provider-results';
import { keepPassedIdentity, reuseKeptIdentity } from '@/server/identity/renter';
import { loadRenterPage } from '@/server/renter/answers';
import { CHECK_RETURN_COOKIE, CHECK_RETURN_MINUTES } from '@/server/renter/check-return';
import { linkIsOpen } from '@/server/renter/gate';
import { personOnRenterPage, rememberIdentityKeepIntent } from '@/server/renter/person';
import { toRenterPage } from './back';

/** UX-RN-14: nothing about the checks is done from a link alone. */
async function open(token: string): Promise<boolean> {
  const page = await loadRenterPage(token);
  return page !== null && (await linkIsOpen(token, page.application.email));
}

/**
 * R18: the renter starts their ID check with the provider. The provider is never given their
 * link: this browser remembers the way back for an hour (UX-RN-17).
 */
export async function startCheckAction(token: string): Promise<void> {
  if (!(await open(token))) toRenterPage(token);
  // P54: a result Stripe already has is read first, so a finished check isn't started again.
  await settleRenterIdentity(token);
  const started = await startProviderCheck(token, 'identity');
  if ('problem' in started) toRenterPage(token, `?check_problem=${started.problem}`);
  (await cookies()).set(CHECK_RETURN_COOKIE, token, cookieOptions(CHECK_RETURN_MINUTES * 60));
  redirect(started.redirectUrl);
}

/**
 * UX-PF-8: "Keep it", after the renter's ID check for this home passed. A signed-in renter whose
 * enquiry this is keeps it on their profile now. Anyone else is sent a sign-in code to the
 * address on the application; entering it sets up their profile and keeps it
 * (`/r/[token]/keep-id`).
 */
export async function keepIdentityAction(token: string): Promise<void> {
  if (!(await open(token))) toRenterPage(token);
  const page = await loadRenterPage(token);
  if (!page) toRenterPage(token);
  const person = await personOnRenterPage(token, page, { attach: true });
  if (person) {
    const kept = await keepPassedIdentity(token, person.userId);
    toRenterPage(token, kept ? '?kept_id=yes' : '?kept_id=no');
  }
  await rememberIdentityKeepIntent(token);
  const sent = await requestSignInCode({
    email: page.application.email,
    attemptId: null,
    nextPath: `/r/${token}/keep-id`,
  });
  if (sent.sent || sent.reason === 'wait') redirect('/sign-in/code');
  toRenterPage(token, '?kept_id=no');
}

/**
 * UX-PF-12: "Yes, use it": the renter's yes, this time, to the ID check they keep. UX-PF-14:
 * `useVerifiedName` is "Use the name on my ID", when the names differ.
 */
export async function reuseKeptIdentityAction(
  token: string,
  useVerifiedName: boolean,
): Promise<void> {
  if (!(await open(token))) toRenterPage(token);
  const page = await loadRenterPage(token);
  if (!page) toRenterPage(token);
  const person = await personOnRenterPage(token, page);
  if (!person) toRenterPage(token);
  const used = await reuseKeptIdentity(token, person.userId, { useVerifiedName });
  if (!used.ok) {
    toRenterPage(
      token,
      used.problem === 'name' || used.problem === 'nothing_kept'
        ? `?id_problem=${used.problem}`
        : `?check_problem=${used.problem}`,
    );
  }
  toRenterPage(token);
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
