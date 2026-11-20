import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { currentUser } from '@/server/auth/member';
import { openEnquiry } from '@/server/renter/enquiries';

export const dynamic = 'force-dynamic';

/**
 * UX-RH-3: a row on Enquiries opens that home's page for the renter: the same page a private
 * link opens, through a fresh link for it. Only one of their own enquiries opens, and only while
 * its details are still held; otherwise it's back to Enquiries, which says the page has closed.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  const { applicationId } = await params;
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL('/sign-in?next=%2Fenquiries', request.url));
  const id = z.uuid().safeParse(applicationId);
  const token = id.success ? await openEnquiry(user.id, id.data) : null;
  return NextResponse.redirect(new URL(token ? `/r/${token}` : '/enquiries?gone=1', request.url));
}
