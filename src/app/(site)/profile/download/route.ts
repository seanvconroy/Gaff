import { NextResponse, type NextRequest } from 'next/server';
import { downloadCopy } from '@/copy/profile';
import { profileForDownload } from '@/server/accounts/delete-profile';
import { currentUser } from '@/server/auth/member';

export const dynamic = 'force-dynamic';

/**
 * "Download my details" (UX-PF-6, GDPR Article 15 and 20): everything Gaff keeps on the signed-in
 * person's own profile, as one file. Nothing an operator holds is in it: each application is that
 * operator's copy, and the file says so.
 */
export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL('/sign-in?next=%2Fprofile', request.url));
  const held = await profileForDownload(user);
  const k = held.kept;
  const file = {
    about: downloadCopy.about,
    name: held.name,
    email: held.email,
    rentingSince: held.rentingSince,
    keepWhatIEnter: k.keepsDetails,
    mobile: k.mobile,
    answers: k.answers,
    answersGiven: k.answersAt,
    howIEarn: k.earning,
    monthlyIncomeCents: k.monthlyIncomeCents,
    incomeGiven: k.incomeAt,
    lastUsed: k.lastUsedAt,
    signIn: held.signIn,
    enquiries: held.enquiries,
  };
  return new NextResponse(JSON.stringify(file, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${downloadCopy.fileName}"`,
      'cache-control': 'no-store',
    },
  });
}
