import { NextResponse } from 'next/server';
import { safeNextPath } from '@/domain/auth/next-path';
import { homeHref, isPublicRef } from '@/domain/homes/home-page';
import { currentUser } from '@/server/auth/member';
import { saveHome } from '@/server/saved/homes';

export const dynamic = 'force-dynamic';

/**
 * The heart, for someone who wasn't signed in (section 2, "What a person needs, and when"):
 * sign-in brings them here, the home is saved, and they're back where they pressed it. Signed
 * out still, it sends them to sign in first, and back here after.
 *
 * Only a home's public reference is in this address, never anything about the person.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const ref = url.searchParams.get('home') ?? '';
  const back =
    safeNextPath(url.searchParams.get('back')) ?? (isPublicRef(ref) ? homeHref(ref) : '/saved');
  const user = await currentUser();
  if (!user) {
    const here = `/saved/save?${new URLSearchParams({ home: ref, back })}`;
    return NextResponse.redirect(
      new URL(`/sign-in?${new URLSearchParams({ next: here })}`, request.url),
    );
  }
  await saveHome(user.id, ref);
  return NextResponse.redirect(new URL(back, request.url));
}
