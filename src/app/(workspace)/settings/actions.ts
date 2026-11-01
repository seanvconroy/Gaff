'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireMember } from '@/server/auth/member';
import { setApproveBeforeSend } from '@/server/answers/review';
import { UserFacingError } from '@/server/errors';
import { setIncomeRule } from '@/server/organisations/income-rule';
import { setUsualTimes } from '@/server/organisations/usual-times';

export async function approveBeforeSendAction(formData: FormData): Promise<void> {
  const member = await requireMember();
  try {
    await setApproveBeforeSend(member, formData.get('on') === 'yes');
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    redirect('/settings?problem=admin');
  }
  revalidatePath('/settings');
  redirect('/settings?saved=approvals');
}

/** R28, Q15: the usual time a letting takes, to compare with time in Gaff. */
export async function usualTimesAction(formData: FormData): Promise<void> {
  const member = await requireMember();
  let result;
  try {
    result = await setUsualTimes(member, {
      hoursPerLetting: String(formData.get('hoursPerLetting') ?? ''),
      daysToLet: String(formData.get('daysToLet') ?? ''),
    });
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    redirect('/settings?problem=admin');
  }
  if (!result.ok) redirect('/settings?problem=usual');
  revalidatePath('/', 'layout');
  redirect('/settings?saved=usual');
}

/** R16, R17: the income rule, the same for everyone. */
export async function incomeRuleAction(formData: FormData): Promise<void> {
  const member = await requireMember();
  try {
    await setIncomeRule(member, Number(formData.get('ruleTenths')));
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    redirect('/settings?problem=admin');
  }
  revalidatePath('/settings');
  redirect('/settings?saved=income');
}
