'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { operatorStepHref, type OperatorStepKey } from '@/domain/tenancy/operator-steps';
import { formValues, invalid, needsConfirming, type FormState } from '@/lib/forms';
import { confirmationFor, forgetConfirmation } from '@/server/auth/confirm-request';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { saveLandlordContact } from '@/server/offers/approval';
import { setListerPhone } from '@/server/organisations/phone';
import {
  addInventoryItem,
  removeInventoryItem,
  saveChecklist,
  shareInventory,
} from '@/server/tenancy/movein';
import { confirmPayment, requestPayment, setPaymentAccount } from '@/server/tenancy/payment';
import { markRtbRegistered, revealPpsn } from '@/server/tenancy/rtb';
import { countersign, markSignedOnPaper, sendAgreement } from '@/server/tenancy/tenancy';

/**
 * UX-TN-1: the one action of each tenancy step's screen. Each returns to its own screen, which
 * then says what was done and what happens next (UX-FL-4). A problem comes back to where the
 * button was pressed, never as a box at the top (UX-FL-3).
 */
async function step(
  lettingId: string,
  key: OperatorStepKey,
  values: Record<string, string>,
  work: () => Promise<void | Record<string, string>>,
): Promise<FormState> {
  try {
    const errors = await work();
    if (errors && Object.keys(errors).length > 0) return invalid(errors, values);
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    return invalid({ [error.field ?? 'form']: error.message }, values);
  }
  revalidatePath(`/lettings/${lettingId}`, 'layout');
  redirect(operatorStepHref(lettingId, key));
}

/** Step 1, first time only: the owner's name and email, so the agreement names the landlord. */
export async function ownerAction(
  lettingId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  const errors: Record<string, string> = {};
  if (!values.landlordName?.trim()) errors.landlordName = 'Enter the owner’s name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.landlordEmail?.trim() ?? '')) {
    errors.landlordEmail = 'Enter the owner’s email, like name@example.ie.';
  }
  if (Object.keys(errors).length > 0) return invalid(errors, values);
  return step(lettingId, 'send_agreement', values, () =>
    saveLandlordContact(member, lettingId, {
      name: values.landlordName ?? '',
      email: values.landlordEmail ?? '',
    }),
  );
}

/** Step 1 (R22): send the agreement, or record that both sides signed on paper (Q23). */
export async function sendAction(
  lettingId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  if (values.intent === 'paper') {
    return step(lettingId, 'sign_agreement', values, () => markSignedOnPaper(member, lettingId));
  }
  return step(lettingId, 'send_agreement', values, () => sendAgreement(member, lettingId));
}

/** Q23: both sides signed the printed agreement, from a screen with no other form. */
export async function paperAction(lettingId: string): Promise<void> {
  const member = await requireMember();
  await markSignedOnPaper(member, lettingId);
  revalidatePath(`/lettings/${lettingId}`, 'layout');
  redirect(operatorStepHref(lettingId, 'sign_agreement'));
}

/** Step 2 (R22): the operator signs for the landlord (a person's decision). */
export async function signAction(
  lettingId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  if (values.intent === 'paper') {
    return step(lettingId, 'sign_agreement', values, () => markSignedOnPaper(member, lettingId));
  }
  return step(lettingId, 'sign_agreement', values, async () => {
    const result = await countersign(member, lettingId, values);
    return result.ok ? undefined : result.errors;
  });
}

/**
 * Step 3, first time only (UX-TN-2, R23): where tenants pay. UX-SI-10, UX-TS-6: saving it asks
 * the admin to confirm it's them again, exactly as in Settings; once they have, the form sends
 * itself again and the account is saved.
 */
export async function accountAction(
  lettingId: string,
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
    return invalid({ form: error.message }, values);
  }
  if (!result.ok && 'confirm' in result) return needsConfirming('change_payment_account', values);
  if (!result.ok) return invalid(result.errors, values);
  await forgetConfirmation();
  revalidatePath(`/lettings/${lettingId}`, 'layout');
  redirect(operatorStepHref(lettingId, 'request_payment'));
}

/** Step 3, first time only (UX-RN-23, Q43): a number the tenant can ring to check the account. */
export async function phoneAction(
  lettingId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  if (!values.phone?.trim())
    return invalid({ phone: 'Enter a phone number, like 01 234 5678' }, values);
  return step(lettingId, 'request_payment', values, () => setListerPhone(member, values.phone!));
}

/** Step 3 (R23): ask the tenant for the deposit and first month's rent. */
export async function requestAction(
  lettingId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  return step(lettingId, 'request_payment', values, async () => {
    try {
      await requestPayment(member, lettingId, { dueDate: values.dueDate ?? '' });
    } catch (error) {
      if (error instanceof UserFacingError && /date/.test(error.message)) {
        return { dueDate: error.message };
      }
      throw error;
    }
  });
}

/** Step 4 (R23): the money is in the operator's own account. */
export async function receivedAction(
  lettingId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  return step(lettingId, 'confirm_payment', formValues(formData), () =>
    confirmPayment(member, lettingId),
  );
}

/** Step 5 (R24): the tenancy is registered with the RTB; the PPS number is deleted. */
export async function rtbAction(
  lettingId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  return step(lettingId, 'register_rtb', values, async () => {
    try {
      await markRtbRegistered(member, lettingId, { reference: values.reference ?? '' });
    } catch (error) {
      if (error instanceof UserFacingError && /registration number/.test(error.message)) {
        return { reference: error.message };
      }
      throw error;
    }
  });
}

/** UX-TN-3 (rule 2): the PPS number, only when "Show" is pressed. */
export async function revealPpsnAction(lettingId: string): Promise<string | null> {
  const member = await requireMember();
  return revealPpsn(member, lettingId);
}

/**
 * Step 6 (R25): the move-in checklist, saved with every press. `intent=share` also shares the
 * inventory with the tenant.
 */
export async function moveInAction(
  lettingId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  const checked = formData.getAll('checklist');
  return step(lettingId, 'hand_over', values, async () => {
    await saveChecklist(member, lettingId, {
      keys: checked.includes('keys') ? 'yes' : '',
      alarms: checked.includes('alarms') ? 'yes' : '',
      repairs: checked.includes('repairs') ? 'yes' : '',
      electricity: values.electricity ?? '',
      gas: values.gas ?? '',
    });
    if (values.intent === 'share') await shareInventory(member, lettingId);
  });
}

/** R25: one item out of the inventory, before it's shared. */
export async function removeItemAction(lettingId: string, itemId: string): Promise<void> {
  const member = await requireMember();
  await removeInventoryItem(member, lettingId, itemId);
  revalidatePath(`/lettings/${lettingId}`, 'layout');
}

/** UX-TN-4 (R25): one inventory item, with an optional photo. The screen opens again, empty. */
export async function itemAction(
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
    return invalid({ [error.field ?? 'form']: error.message }, values);
  }
  if (!result.ok) return invalid(result.errors, values);
  revalidatePath(`/lettings/${lettingId}`, 'layout');
  // The next item is usually in the same room.
  return invalid({}, { added: `${values.item.trim()}, ${values.room.trim()}`, room: values.room });
}
