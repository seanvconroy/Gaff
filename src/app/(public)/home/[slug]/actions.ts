'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { env } from '@/lib/env';
import { formValues, invalid, type FormState } from '@/lib/forms';
import { auth } from '@/server/auth/auth';
import { currentUser } from '@/server/auth/member';
import { enquireAboutListing } from '@/server/enquiries/marketplace';
import { startRenting } from '@/server/renters/profile';

/** M76: the enquiry sheet signs a new renter in with a code, without leaving the page. */
export interface CodeState extends FormState {
  step?: 'code';
}

const startSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Enter your name, as you’d like the letter to see it')
    .max(120, 'Keep your name under 120 characters'),
  email: z.email('Enter your email address, like aoife@example.ie').max(254),
});

const slugSchema = z.string().regex(/^[a-z0-9-]{1,120}$/);

export async function sendEnquiryCode(
  slug: string,
  _state: CodeState,
  formData: FormData,
): Promise<CodeState> {
  if (!env().MARKETPLACE_PUBLIC || !slugSchema.safeParse(slug).success) redirect('/to-rent');
  const values = formValues(formData);
  const parsed = startSchema.safeParse(values);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return invalid(errors, values);
  }
  try {
    await auth().api.sendVerificationOTP({
      body: { email: parsed.data.email.toLowerCase(), type: 'sign-in' },
      headers: await headers(),
    });
  } catch {
    return invalid({}, values, 'That didn’t send. Wait a minute and try again.');
  }
  return { step: 'code', values: { ...values, email: parsed.data.email.toLowerCase() } };
}

export async function confirmEnquiryCode(
  slug: string,
  _state: CodeState,
  formData: FormData,
): Promise<CodeState> {
  if (!env().MARKETPLACE_PUBLIC || !slugSchema.safeParse(slug).success) redirect('/to-rent');
  const values = formValues(formData);
  const parsed = startSchema.safeParse(values);
  const code = (values.code ?? '').replace(/\s/g, '');
  if (!parsed.success) return { step: 'code', ...invalid({}, values, 'Start again.') };
  if (!/^\d{6}$/.test(code)) {
    return { step: 'code', ...invalid({ code: 'Enter the 6-digit code from the email' }, values) };
  }
  let userId: string;
  try {
    const signedIn = await auth().api.signInEmailOTP({
      body: { email: parsed.data.email.toLowerCase(), otp: code, name: parsed.data.fullName },
      headers: await headers(),
    });
    userId = signedIn.user.id;
  } catch {
    return {
      step: 'code',
      ...invalid(
        {
          code: 'That code isn’t right, or it’s more than 10 minutes old. Check the email, or ask for a new code.',
        },
        values,
      ),
    };
  }
  await startRenting(userId, parsed.data.fullName.split(/\s+/)[0]!);
  redirect(`/home/${slug}#enquire`);
}

export async function sendEnquiryAction(
  slug: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!env().MARKETPLACE_PUBLIC || !slugSchema.safeParse(slug).success) redirect('/to-rent');
  const user = await currentUser();
  if (!user) redirect(`/home/${slug}#enquire`);
  const values = formValues(formData);
  const result = await enquireAboutListing({ userId: user.id, email: user.email }, slug, values);
  if (!result.ok) {
    return 'errors' in result
      ? invalid(result.errors, values)
      : invalid({}, values, result.refused);
  }
  redirect(`/my/homes/${result.applicationId}?sent=1`);
}
