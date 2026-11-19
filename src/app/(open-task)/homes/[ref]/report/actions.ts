'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { listingReportSchema } from '@/domain/homes/report';
import { reportHref } from '@/domain/homes/home-page';
import { type FormState, fieldErrors, formValues, invalid } from '@/lib/forms';
import { reportListing, reportsLimited } from '@/server/homes/report';

/**
 * UX-TS-3, BA-9 (M96): "Send report". Checked here as on the page; at most 10 a day from one
 * network address; then it opens or joins the home's case, or the home has gone. The page
 * acknowledges it at once, with when a person will look. The address never goes in the link.
 */
export async function reportAction(
  ref: string,
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const values = formValues(data);
  const parsed = listingReportSchema.safeParse(values);
  if (!parsed.success) return invalid(fieldErrors(parsed.error), values);
  if (await reportsLimited(await headers())) redirect(`${reportHref(ref)}?limited=1`);
  const sent = await reportListing(ref, parsed.data);
  if (!sent) redirect(`${reportHref(ref)}?gone=1`);
  const query = new URLSearchParams({ sent: '1', by: sent.dueBy.toISOString() });
  if (parsed.data.email) query.set('email', '1');
  redirect(`${reportHref(ref)}?${query}`);
}
