import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { sealStandInPerson, standInPath, standInPerson } from '@/adapters/sign-in/stand-in';
import { signInProviderSchema } from '@/domain/auth/methods';
import { env } from '@/lib/env';
import { signInProviderModes } from '@/server/auth/auth';

export const dynamic = 'force-dynamic';

const personSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email().max(254),
});

/**
 * Development stand-in for Google or Apple: the tester has said who is signing in, or pressed
 * Cancel. It answers the way the provider would: a redirect to Better Auth's own callback, and
 * nowhere else, with a sealed note of the made-up person in place of an authorisation code.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
): Promise<Response> {
  const provider = signInProviderSchema.safeParse((await params).provider);
  if (!env().DEV_TOOLS || !provider.success) return new Response(null, { status: 404 });
  if (signInProviderModes()[provider.data] !== 'stand_in') {
    return new Response(null, { status: 404 });
  }
  const form = await request.formData();
  const state = String(form.get('state') ?? '');
  const callback = new URL(`/api/auth/callback/${provider.data}`, env().APP_URL);
  callback.searchParams.set('state', state);

  if (form.get('answer') === 'cancel') {
    // What Google and Apple send when the person presses Cancel.
    callback.searchParams.set('error', 'access_denied');
    return NextResponse.redirect(callback, 303);
  }
  const parsed = personSchema.safeParse({
    name: String(form.get('name') ?? ''),
    email: String(form.get('email') ?? ''),
  });
  if (!parsed.success) {
    // Back to the stand-in page to try again.
    const again = new URL(standInPath(provider.data), env().APP_URL);
    again.searchParams.set('state', state);
    again.searchParams.set('redirect_uri', `${callback.origin}${callback.pathname}`);
    again.searchParams.set('problem', '1');
    return NextResponse.redirect(again, 303);
  }
  const person = standInPerson(provider.data, {
    ...parsed.data,
    hideEmail: form.get('hideEmail') === 'yes',
  });
  callback.searchParams.set('code', sealStandInPerson(person));
  return NextResponse.redirect(callback, 303);
}
