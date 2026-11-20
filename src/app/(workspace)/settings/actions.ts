'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { confirmationFor, forgetConfirmation } from '@/server/auth/confirm-request';
import { requireMember } from '@/server/auth/member';
import { setApproveBeforeSend } from '@/server/answers/review';
import { UserFacingError } from '@/server/errors';
import { formValues, invalid, needsConfirming, type FormState } from '@/lib/forms';
import { setIncomeRule } from '@/server/organisations/income-rule';
import { setListerPhone } from '@/server/organisations/phone';
import { setPaymentAccount } from '@/server/tenancy/payment';

/** UX-ST-1: each settings page saves its one subject and comes back to say so. */
async function save(page: string, work: () => Promise<void>): Promise<never> {
  try {
    await work();
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    redirect(`/settings/${page}?problem=${error.field === 'phone' ? 'phone' : 'admin'}`);
  }
  revalidatePath('/', 'layout');
  redirect(`/settings/${page}?saved=1`);
}

/** UX-ST-2, UX-AI-14 (R29): "Check Gaff's answers before they go", the assistant's one switch. */
export async function assistantAction(formData: FormData): Promise<void> {
  const member = await requireMember();
  await save('assistant', () => setApproveBeforeSend(member, formData.get('on') === 'yes'));
}

/** R16, R17: the income rule, the same for everyone. */
export async function incomeRuleAction(formData: FormData): Promise<void> {
  const member = await requireMember();
  await save('income', () => setIncomeRule(member, Number(formData.get('ruleTenths'))));
}

/** Q43: the number renters can ring, on every renter page and the payment page. */
export async function phoneAction(formData: FormData): Promise<void> {
  const member = await requireMember();
  if (member.role !== 'admin') redirect('/settings/agency?problem=admin');
  const phone = String(formData.get('phone') ?? '').trim();
  await save('agency', () => setListerPhone(member, phone || null));
}

/**
 * R23: the account tenants pay into. UX-SI-10, UX-TS-6: saving it asks the admin to confirm
 * it's them again. The form comes back asking for that, with what was typed kept; once they've
 * confirmed, it sends itself again and the change is saved.
 */
export async function paymentAccountAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  let result;
  try {
    result = await setPaymentAccount(
      member,
      values,
      await confirmationFor(member.userId, 'change_payment_account'),
    );
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    return invalid({}, values, error.message);
  }
  if (!result.ok && 'confirm' in result) return needsConfirming('change_payment_account', values);
  if (!result.ok) return invalid(result.errors, values, 'One or two details need another look.');
  await forgetConfirmation();
  revalidatePath('/', 'layout');
  redirect('/settings/payment?saved=1');
}
