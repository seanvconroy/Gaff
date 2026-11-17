'use server';

import { redirect } from 'next/navigation';
import { listingReportSchema } from '@/domain/homes/report';
import { reportHref } from '@/domain/homes/home-page';
import { type FormState, fieldErrors, formValues, invalid } from '@/lib/forms';
import { reportListing } from '@/server/homes/report';

/** UX-TS-3: "Send report". Checked here as on the page; then sent on, or the home has gone. */
export async function reportAction(
  ref: string,
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const values = formValues(data);
  const parsed = listingReportSchema.safeParse(values);
  if (!parsed.success) return invalid(fieldErrors(parsed.error), values);
  const sent = await reportListing(ref, parsed.data);
  redirect(`${reportHref(ref)}?${sent ? 'sent=1' : 'gone=1'}`);
}
