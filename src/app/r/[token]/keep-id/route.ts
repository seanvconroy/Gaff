import { NextResponse, type NextRequest } from 'next/server';
import { nameIsKnown } from '@/domain/accounts/first-run';
import { saveName } from '@/server/accounts/contexts';
import { currentUser } from '@/server/auth/member';
import { keepPassedIdentity } from '@/server/identity/renter';
import { loadRenterPage } from '@/server/renter/answers';
import { personOnRenterPage, takeIdentityKeepIntent } from '@/server/renter/person';

export const dynamic = 'force-dynamic';

/**
 * UX-PF-8: where the sign-in code from "Keep it" on the ID check comes back to. The person has
 * just signed in with the address on the application, so the enquiry is theirs: it's added to
 * their Enquiries, and the ID check that passed for this home is kept on their profile (the
 * name and the date). Then back to their page, which says so once.
 *
 * Only a browser that pressed "Keep it" for this link a short while ago gets here with anything
 * to keep. Anyone else just goes on to the page.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const back = (kept: string) => NextResponse.redirect(new URL(`/r/${token}${kept}`, request.url));
  const pressed = await takeIdentityKeepIntent(token);
  const [user, page] = await Promise.all([currentUser(), loadRenterPage(token)]);
  if (!page || !pressed || !user) return back('');
  const person = await personOnRenterPage(token, page, { attach: true });
  if (!person) return back('?kept_id=no');
  const kept = await keepPassedIdentity(token, person.userId);
  if (!nameIsKnown(user.name)) {
    await saveName(user, page.application.fullName).catch(() => undefined);
  }
  return back(kept ? '?kept_id=yes' : '?kept_id=no');
}
