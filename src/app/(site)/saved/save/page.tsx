import { redirect } from 'next/navigation';
import { safeNextPath } from '@/domain/auth/next-path';
import { homeHref, isPublicRef } from '@/domain/homes/home-page';
import { currentUser } from '@/server/auth/member';
import { saveHome } from '@/server/saved/homes';

export const dynamic = 'force-dynamic';

/**
 * The heart, for someone who wasn't signed in (section 2, "What a person needs, and when"):
 * sign-in brings them here, the home is saved, and they're back where they pressed it. Signed
 * out still, it sends them to sign in first, and back here after. Nothing is shown here.
 *
 * Only a home's public reference is in this address, never anything about the person.
 */
export default async function SaveAfterSignIn({
  searchParams,
}: {
  searchParams: Promise<{ home?: string; back?: string }>;
}) {
  const query = await searchParams;
  const ref = typeof query.home === 'string' ? query.home : '';
  const back = safeNextPath(query.back) ?? (isPublicRef(ref) ? homeHref(ref) : '/saved');
  const user = await currentUser();
  if (!user) {
    const here = `/saved/save?${new URLSearchParams({ home: ref, back })}`;
    redirect(`/sign-in?${new URLSearchParams({ next: here })}`);
  }
  await saveHome(user.id, ref);
  redirect(back);
}
