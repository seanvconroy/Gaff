'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { usualStillToAsk, type UsualQuestion } from '@/domain/tenancy/results';
import { formValues, invalid, type FormState } from '@/lib/forms';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { answerUsual } from '@/server/organisations/usual-times';
import { finishLetting } from '@/server/tenancy/close';
import { letResults } from '@/server/tenancy/results';

/** Where closing goes after a step: the usual's questions if they're still to ask, then results. */
async function onwards(lettingId: string): Promise<never> {
  const member = await requireMember();
  const results = await letResults(member, lettingId);
  const ask = results?.canSetUsual ? usualStillToAsk(results.usual) : null;
  redirect(ask ? `/lettings/${lettingId}/finish/usual` : `/lettings/${lettingId}/let`);
}

/** UX-TN-5 (R26): Finish. The letting is archived and the tenant's details get their date. */
export async function finishAction(
  lettingId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  try {
    await finishLetting(member, lettingId);
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    return invalid({ form: error.message }, formValues(formData));
  }
  revalidatePath('/', 'layout');
  return onwards(lettingId);
}

/** UX-TN-7: one of the two tap questions about the usual. */
export async function usualAction(
  lettingId: string,
  question: UsualQuestion,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  const result = await answerUsual(member, question, values.answer ?? '');
  if (!result.ok) return invalid({ answer: result.error }, values);
  revalidatePath('/', 'layout');
  return onwards(lettingId);
}
