'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { formValues, invalid, type FormState } from '@/lib/forms';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { saveLandlordContact } from '@/server/offers/approval';
import { countersign, markSignedOnPaper, sendAgreement } from '@/server/tenancy/tenancy';

async function run(lettingId: string, done: string, work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    redirect(`/lettings/${lettingId}/tenancy?problem=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/lettings/${lettingId}`, 'layout');
  redirect(`/lettings/${lettingId}/tenancy?${done}=1`);
}

/** R22: send the agreement to the tenant to read and sign. */
export async function sendAgreementAction(lettingId: string): Promise<void> {
  const member = await requireMember();
  await run(lettingId, 'sent', () => sendAgreement(member, lettingId));
}

/** R22, Q23: both sides signed the printed agreement by hand. */
export async function paperAction(lettingId: string): Promise<void> {
  const member = await requireMember();
  await run(lettingId, 'signed', () => markSignedOnPaper(member, lettingId));
}

/** R22: the operator signs for the landlord (a person's decision). */
export async function countersignAction(
  lettingId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  let result;
  try {
    result = await countersign(member, lettingId, values);
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    return invalid({}, values, error.message);
  }
  if (!result.ok) return invalid(result.errors, values, 'One or two things need another look.');
  revalidatePath(`/lettings/${lettingId}`, 'layout');
  redirect(`/lettings/${lettingId}/tenancy?signed=1`);
}

/** R22: the agreement names the landlord, so an agency adds their details here if missing. */
export async function landlordForAgreementAction(
  lettingId: string,
  formData: FormData,
): Promise<void> {
  const member = await requireMember();
  await run(lettingId, 'landlord', () =>
    saveLandlordContact(member, lettingId, {
      name: String(formData.get('landlordName') ?? ''),
      email: String(formData.get('landlordEmail') ?? ''),
    }),
  );
}
