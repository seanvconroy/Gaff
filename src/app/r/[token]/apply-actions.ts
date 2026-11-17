'use server';

import { common } from '@/copy/renter';
import { formValues, invalid, needsConfirming, type FormState } from '@/lib/forms';
import { submitApplication } from '@/server/applications/apply';
import { loadRenterPage } from '@/server/renter/answers';
import { linkIsOpen } from '@/server/renter/gate';
import { toRenterPage } from './back';

/**
 * R16, UX-RN-11: the renter applies (stage 5). A changed email needs the one-time code first:
 * the form is told so (`confirm`), shows the code's sheet, and sends itself again.
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
  toRenterPage(token);
}
