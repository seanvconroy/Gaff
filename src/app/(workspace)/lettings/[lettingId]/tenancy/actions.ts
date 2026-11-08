'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { formValues, invalid, type FormState } from '@/lib/forms';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { recordIdSeenInPerson } from '@/server/identity/in-person';
import { saveLandlordContact } from '@/server/offers/approval';
import { confirmPayment, requestPayment } from '@/server/tenancy/payment';
import { markRtbRegistered } from '@/server/tenancy/rtb';
import { finishLetting } from '@/server/tenancy/close';
import {
  addInventoryItem,
  removeInventoryItem,
  saveChecklist,
  shareInventory,
} from '@/server/tenancy/movein';
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

/** P27: the letter saw the renter's original photo ID when they met, and records the name. */
export async function seenIdAction(
  lettingId: string,
  applicationId: string,
  formData: FormData,
): Promise<void> {
  const member = await requireMember();
  await run(lettingId, 'id_seen', () =>
    recordIdSeenInPerson(member, applicationId, String(formData.get('seenName') ?? '')),
  );
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

/** R23: ask the tenant for the deposit and first month's rent. */
export async function requestPaymentAction(lettingId: string, formData: FormData): Promise<void> {
  const member = await requireMember();
  await run(lettingId, 'requested', () =>
    requestPayment(member, lettingId, { dueDate: String(formData.get('dueDate') ?? '') }),
  );
}

/** R23: the money has arrived in the operator's account. */
export async function confirmPaymentAction(lettingId: string): Promise<void> {
  const member = await requireMember();
  await run(lettingId, 'paid', () => confirmPayment(member, lettingId));
}

/** R24: the tenancy is registered with the RTB. */
export async function rtbRegisteredAction(lettingId: string, formData: FormData): Promise<void> {
  const member = await requireMember();
  await run(lettingId, 'registered', () =>
    markRtbRegistered(member, lettingId, { reference: String(formData.get('reference') ?? '') }),
  );
}

/** R25: the move-in checklist. */
export async function checklistAction(lettingId: string, formData: FormData): Promise<void> {
  const member = await requireMember();
  await run(lettingId, 'checklist', () =>
    saveChecklist(member, lettingId, {
      keys: formData.getAll('checklist').includes('keys') ? 'yes' : '',
      alarms: formData.getAll('checklist').includes('alarms') ? 'yes' : '',
      repairs: formData.getAll('checklist').includes('repairs') ? 'yes' : '',
      electricity: String(formData.get('electricity') ?? ''),
      gas: String(formData.get('gas') ?? ''),
    }),
  );
}

/** R25: one inventory item, with an optional photo. */
export async function inventoryItemAction(
  lettingId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = {
    room: String(formData.get('room') ?? ''),
    item: String(formData.get('item') ?? ''),
    condition: String(formData.get('condition') ?? ''),
    note: String(formData.get('note') ?? ''),
  };
  const file = formData.get('photo');
  const photo =
    file instanceof File && file.size > 0 ? Buffer.from(await file.arrayBuffer()) : null;
  let result;
  try {
    result = await addInventoryItem(member, lettingId, values, photo);
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    return invalid({}, values, error.message);
  }
  if (!result.ok) return invalid(result.errors, values, 'One or two things need another look.');
  revalidatePath(`/lettings/${lettingId}/tenancy`);
  redirect(`/lettings/${lettingId}/tenancy?added=1#movein-heading`);
}

export async function removeItemAction(lettingId: string, itemId: string): Promise<void> {
  const member = await requireMember();
  await run(lettingId, 'removed', () => removeInventoryItem(member, lettingId, itemId));
}

/** R25: send the tenant the inventory to look over and confirm. */
export async function shareInventoryAction(lettingId: string): Promise<void> {
  const member = await requireMember();
  await run(lettingId, 'shared', () => shareInventory(member, lettingId));
}

/** R26, stage 9: finish and archive the let home. */
export async function finishAction(lettingId: string): Promise<void> {
  const member = await requireMember();
  await run(lettingId, 'finished', async () => {
    await finishLetting(member, lettingId);
  });
}
