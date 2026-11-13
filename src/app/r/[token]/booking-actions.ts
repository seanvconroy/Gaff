'use server';

import { redirect } from 'next/navigation';
import { mobileProblems } from '@/copy/verification';
import { invalid, type FormState } from '@/lib/forms';
import { bookViewing, cancelViewing } from '@/server/viewings/booking';
import { confirmBookingCode, sendBookingCode } from '@/server/viewings/mobile';

const problems = {
  invalid_link: 'link',
  not_invited: 'not_invited',
  full: 'full',
  too_late: 'too_late',
  mobile_needed: 'mobile',
} as const;

async function book(token: string, slotId: string): Promise<never> {
  const result = await bookViewing(token, slotId);
  if (!result.ok) redirect(`/r/${token}?problem=${problems[result.reason]}`);
  redirect(`/r/${token}?booked=${result.rescheduled ? 'moved' : 'yes'}`);
}

/**
 * R12, P16 (Q60): the renter chose a time. Gaff texts a code to confirm their mobile first;
 * someone moving their viewing, or whose mobile is already confirmed, books straight away.
 * Booking checks the mobile again, so this can't be skipped.
 */
export async function chooseTimeAction(
  token: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const slotId = String(formData.get('slotId') ?? '');
  const mobile = String(formData.get('mobile') ?? '');
  const resending = formData.get('resend') === 'yes';
  if (!slotId) return invalid({ slotId: 'Choose a time first.' }, { mobile });
  if (formData.get('how') !== 'code') return book(token, slotId);
  const sent = await sendBookingCode(token, mobile);
  if (!sent.ok) {
    if (sent.problem === 'link') redirect(`/r/${token}?problem=link`);
    const masked = String(formData.get('masked') ?? '');
    return invalid(
      { mobile: mobileProblems[sent.problem] },
      { slotId, mobile, ...(resending ? { masked } : {}) },
      resending ? 'sent' : undefined,
    );
  }
  return {
    values: {
      slotId,
      mobile,
      masked: sent.masked,
      ...(sent.testCopyCode ? { testCode: sent.testCopyCode } : {}),
    },
    message: 'sent',
  };
}

/** P16: the code from the text confirms the mobile, and then the time is booked. */
export async function confirmBookingAction(
  token: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = {
    slotId: String(formData.get('slotId') ?? ''),
    mobile: String(formData.get('mobile') ?? ''),
    masked: String(formData.get('masked') ?? ''),
  };
  const confirmed = await confirmBookingCode(token, String(formData.get('code') ?? ''));
  if (!confirmed.ok) {
    if (confirmed.problem === 'link') redirect(`/r/${token}?problem=link`);
    return { ...invalid({ code: mobileProblems[confirmed.problem] }, values), message: 'sent' };
  }
  return book(token, values.slotId);
}

export async function cancelAction(token: string): Promise<void> {
  const result = await cancelViewing(token);
  redirect(result.ok ? `/r/${token}?cancelled=1` : `/r/${token}`);
}
