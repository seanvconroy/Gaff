'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from '@/lib/env';
import { formValues, invalid, type FormState } from '@/lib/forms';
import { currentUser } from '@/server/auth/member';
import { submitReport } from '@/server/moderation/reports';

/** M96: a report, with no account needed. */
export async function reportAction(
  slug: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!env().MARKETPLACE_PUBLIC || !/^[a-z0-9-]{1,120}$/.test(slug)) redirect('/to-rent');
  const values = formValues(formData);
  const request = await headers();
  const user = await currentUser();
  const result = await submitReport({
    slug,
    values,
    ip: request.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.get('x-real-ip') ?? '',
    userAgent: request.get('user-agent') ?? '',
    userId: user?.id ?? null,
  });
  if (!result.ok) {
    return 'errors' in result
      ? invalid(result.errors, values)
      : invalid({}, values, result.refused);
  }
  redirect(`/home/${slug}/report?sent=1`);
}
