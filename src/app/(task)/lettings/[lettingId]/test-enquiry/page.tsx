import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { canSendTestEnquiry } from '@/domain/lettings/setup';
import { TEST_RENTER, enquiryCount } from '@/server/lettings/test-enquiry';
import { testEnquiryAction } from '../../_flow/actions';
import { flowHome } from '../../_flow/home';
import { TestEnquiry } from '../../_flow/TestEnquiry';

export const metadata: Metadata = { title: 'Send a test enquiry' };

/**
 * UX-LT-24: "Send a test enquiry", from a live letting's menu until its first real enquiry
 * arrives. It shows the lister what a renter gets. Nothing is sent to anyone.
 */
export default async function TestEnquiryPage({
  params,
}: {
  params: Promise<{ lettingId: string }>;
}) {
  const { lettingId } = await params;
  const { member, home } = await flowHome(lettingId);
  const lettingHref = `/lettings/${lettingId}`;
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
