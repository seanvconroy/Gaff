import { NextResponse, type NextRequest } from 'next/server';
import { saveName } from '@/server/accounts/contexts';
import { keepEntered } from '@/server/accounts/renter-profile';
import { currentUser } from '@/server/auth/member';
import { nameIsKnown } from '@/domain/accounts/first-run';
import { loadRenterPage } from '@/server/renter/answers';
import { enteredOn, personOnRenterPage, takeKeepIntent } from '@/server/renter/person';

export const dynamic = 'force-dynamic';

/**
 * UX-RN-13, UX-PF-1: where the sign-in code from "Keep my details for next time" comes back to.
 * The person has just signed in with the address on the application, so the enquiry is theirs:
 * it is added to their Enquiries, their profile starts with what they entered, and their name is
 * the one on the application if they hadn't given one. Then back to the home's page, which says
 * the details are kept.
 *
 * Only a browser that ticked the box for this link a short while ago gets here with anything to
 * keep. Anyone else just goes on to the page.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const back = (kept: string) => NextResponse.redirect(new URL(`/r/${token}${kept}`, request.url));
  const ticked = await takeKeepIntent(token);
  const [user, page] = await Promise.all([currentUser(), loadRenterPage(token)]);
  if (!page) return back('');
  if (!ticked || !user) return back('');
  const person = await personOnRenterPage(token, page, { attach: true });
  if (!person) return back('?kept=no');
  await keepEntered(person.userId, enteredOn(page), {
    from: 'tick',
    applicationId: page.application.id,
  });
  if (!nameIsKnown(user.name)) {
    await saveName(user, page.application.fullName).catch(() => undefined);
  }
  return back('?kept=yes');
}
