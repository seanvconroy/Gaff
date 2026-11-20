import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { canSendTestEnquiry } from '@/domain/lettings/setup';
import { returnPath } from '@/domain/navigation/return-to';
import { TEST_RENTER, enquiryCount } from '@/server/lettings/test-enquiry';
import { testEnquiryAction } from '../../_flow/actions';
import { flowHome } from '../../_flow/home';
import { TestEnquiry } from '../../_flow/TestEnquiry';

export const metadata: Metadata = { title: 'Send a test enquiry' };

/**
 * UX-LT-24: "Send a test enquiry", from a live letting's menu until its first real enquiry
 * arrives. It shows the lister what a renter gets. Nothing is sent to anyone.
 *
 * UX-GR-3: a first letting's go-live ends here (`live=1`), and so does the setup checklist's
 * "See Gaff answer an enquiry" (`from=/today`). Done, it goes back to where it came from: the
 * letting, saying it's live, or Today.
 */
export default async function TestEnquiryPage({
  params,
  searchParams,
}: {
  params: Promise<{ lettingId: string }>;
  searchParams: Promise<{ live?: string; from?: string }>;
}) {
  const { lettingId } = await params;
  const query = await searchParams;
  const { member, home } = await flowHome(lettingId);
  const lettingHref =
    query.live === '1'
      ? `/lettings/${lettingId}?saved=live`
      : returnPath(query.from, `/lettings/${lettingId}`);
  if (home.kind !== 'letting') redirect('/lettings');
  const { letting } = home.detail;
  const enquiries = await enquiryCount(member, lettingId);
  if (!canSendTestEnquiry({ status: letting.status, enquiries })) redirect(lettingHref);
  return (
    <TestEnquiry
      action={testEnquiryAction.bind(null, lettingId)}
      address={letting.addressLine1}
      renterName={TEST_RENTER}
      lettingHref={lettingHref}
    />
  );
}
