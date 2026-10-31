'use server';

import { redirect } from 'next/navigation';
import { bookViewing, cancelViewing } from '@/server/viewings/booking';

const problems = {
  invalid_link: 'link',
  not_invited: 'not_invited',
  full: 'full',
  too_late: 'too_late',
  invalid_phone: 'phone',
} as const;

export async function bookAction(token: string, formData: FormData): Promise<void> {
  const slotId = String(formData.get('slotId') ?? '');
  if (!slotId) redirect(`/r/${token}?problem=choose`);
  const result = await bookViewing(token, slotId, String(formData.get('mobile') ?? ''));
  if (!result.ok) redirect(`/r/${token}?problem=${problems[result.reason]}`);
  redirect(`/r/${token}?booked=${result.rescheduled ? 'moved' : 'yes'}`);
}

export async function cancelAction(token: string): Promise<void> {
  const result = await cancelViewing(token);
  redirect(result.ok ? `/r/${token}?cancelled=1` : `/r/${token}`);
}
