'use server';

import { redirect } from 'next/navigation';
import { common } from '@/copy/renter';
import { formValues, invalid, needsConfirming, type FormState } from '@/lib/forms';
import { submitApplication } from '@/server/applications/apply';
import { requestSignInCode } from '@/server/auth/sign-in';
import { loadRenterPage } from '@/server/renter/answers';
import { linkIsOpen } from '@/server/renter/gate';
import { keepEntered } from '@/server/accounts/renter-profile';
import {
  enteredOn,
  keepAfter,
  personOnRenterPage,
  rememberKeepIntent,
} from '@/server/renter/person';
import { toRenterPage } from './back';

/**
 * R16, UX-RN-11: the renter applies (stage 5). A changed email needs the one-time code first:
 * the form is told so (`confirm`), shows the code's sheet, and sends itself again.
 *
 * UX-RN-13, UX-PF-2: once the application is in, what they entered is kept on their profile:
 * - a signed-in renter whose enquiry this is keeps it while keeping is on, or because they
 *   ticked "Keep my details for next time";
 * - anyone else who ticked it is sent a sign-in code to the address on the application, the one
 *   they've already confirmed. Entering it creates their profile and keeps the details
 *   (`/r/[token]/keep`). The application is in either way.
 */
export async function applyAction(
  token: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  const page = await loadRenterPage(token);
  if (!page) return invalid({ form: common.linkEnded }, values);
  const result = await submitApplication(token, values, {
    emailCanChange: await linkIsOpen(token, page.application.email),
  });
  if (!result) return invalid({ form: common.linkEnded }, values);
  if (!result.ok) {
    if ('closed' in result) toRenterPage(token);
    if ('needsCode' in result) return needsConfirming('link_code', values);
    return invalid(result.errors, values);
  }
  const ticked = values.keepDetails === 'on';
  const applied = await loadRenterPage(token);
  if (!applied) toRenterPage(token);
  const person = await personOnRenterPage(token, applied, { attach: true });
  if (person) {
    if (ticked) {
      await keepEntered(person.userId, enteredOn(applied), {
        from: 'tick',
        applicationId: applied.application.id,
      });
    } else {
      await keepAfter(
        person,
        applied.application.id,
        'application',
        { income: enteredOn(applied).income },
        values.offered === 'income' ? 'income' : undefined,
      );
    }
    toRenterPage(token);
  }
  if (ticked) {
    await rememberKeepIntent(token);
    const sent = await requestSignInCode({
      email: applied.application.email,
      attemptId: null,
      nextPath: `/r/${token}/keep`,
    });
    if (sent.sent || sent.reason === 'wait') redirect('/sign-in/code');
    toRenterPage(token, '?kept=no');
  }
  toRenterPage(token);
}
