'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { formValues, invalid, type FormState } from '@/lib/forms';
import { withdrawEnquiry } from '@/server/enquiries/marketplace';
import { renterPageLink, sendMessageInApp } from '@/server/renters/homes';
import { requireRenter } from '../../renter';

const id = z.uuid();

/** M79: opens the renter's own page for the home (booking, application, offer, tenancy). */
export async function openRenterPage(applicationId: string): Promise<void> {
  const { renter } = await requireRenter();
  const link = id.safeParse(applicationId).success
    ? await renterPageLink(renter, applicationId)
    : null;
  redirect(link ?? '/my');
}

/** M80: the renter writes to the letter from Gaff. */
export async function sendMessageAction(
  applicationId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const { renter } = await requireRenter();
  const values = formValues(formData);
  if (!id.safeParse(applicationId).success) redirect('/my');
  const body = (values.body ?? '').trim();
  if (!body) return invalid({ body: 'Write your message first' }, values);
  if (body.length > 5000)
    return invalid({ body: 'Keep your message under 5,000 characters' }, values);
  const sent = await sendMessageInApp(renter, applicationId, body);
  if (sent === 'not_found') redirect('/my');
  redirect(`/my/homes/${applicationId}?written=1#messages`);
}

/** M81: the renter withdraws their enquiry. */
export async function withdrawAction(applicationId: string): Promise<void> {
  const { renter } = await requireRenter();
  if (!id.safeParse(applicationId).success) redirect('/my');
  await withdrawEnquiry(renter, applicationId);
  redirect(`/my/homes/${applicationId}`);
}
