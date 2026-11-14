import { NextResponse } from 'next/server';
import { z } from 'zod';
import { env } from '@/lib/env';
import { providerModes } from '@/server/auth/providers';
import { callbackUrl, issueStandInCode, standInIdentity } from '@/server/auth/stand-in-provider';

export const dynamic = 'force-dynamic';

const providerSchema = z.enum(['google', 'apple']);

/**
 * Local development and tests only: the tester has chosen who to be. Like a real provider, the
 * stand-in answers with a redirect back to Gaff: with a one-time code, or with "access_denied"
 * if they cancelled. A redirect from the server, not a script, so the browser really leaves and
 * comes back, as it does with Google and Apple.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
): Promise<Response> {
  const asked = providerSchema.safeParse((await params).provider);
  if (!asked.success || providerModes()[asked.data] !== 'stand_in') {
    return new Response('Not found', { status: 404 });
  }
  const provider = asked.data;
  const form = await request.formData();
  const back = new URLSearchParams({ state: String(form.get('state') ?? '') });
  const seeOther = (url: string) => NextResponse.redirect(new URL(url, env().APP_URL), 303);

  if (form.get('answer') === 'cancel') {
    back.set('error', 'access_denied');
    return seeOther(`${callbackUrl(provider)}?${back}`);
  }
  const email = z.email().safeParse(String(form.get('email') ?? '').trim());
  if (!email.success) return new Response('Enter an email address', { status: 400 });
  const says = form.getAll('says').map(String);
  const identity = standInIdentity(provider, {
    email: email.data,
    name: String(form.get('name') ?? '').slice(0, 80),
    verified: says.includes('verified'),
    workspace: says.includes('workspace'),
    hidden: says.includes('hidden'),
  });
  const challenge = String(form.get('code_challenge') ?? '') || undefined;
  back.set('code', await issueStandInCode(provider, identity, challenge));
  // Apple answers with a form post, so its stand-in goes by way of a page that posts one.
  if (form.get('response_mode') === 'form_post') {
    return seeOther(`/dev/sign-in-provider/${provider}/return?${back}`);
  }
  return seeOther(`${callbackUrl(provider)}?${back}`);
}
