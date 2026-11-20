import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { lettingPageCopy } from '@/copy/letting-page';
import {
  enquiryState,
  MAX_CLOSE_AHEAD_DAYS,
  mayCloseEnquiries,
} from '@/domain/lettings/enquiries-close';
import { formatDateTime, irishToday } from '@/lib/format';
import { stoppedByConflict } from '@/server/accounts/conflict';
import { requireMember } from '@/server/auth/member';
import { getLetting } from '@/server/lettings/queries';
import { StepForm } from '../tenancy/StepForm';
import { reopenEnquiriesAction, stopEnquiriesAction } from './actions';
import { StopForm } from './StopForm';

const copy = lettingPageCopy.enquiries;

export const metadata: Metadata = { title: copy.metaTitle };
export const dynamic = 'force-dynamic';

/**
 * UX-LP-5, M52 (BA-14): "Stop taking enquiries", from a live letting's menu: one question, now
 * or at a date and time. Once stopped (or set to stop), the same address offers "Take enquiries
 * again".
 */
export default async function EnquiriesPage({
  params,
}: {
  params: Promise<{ lettingId: string }>;
}) {
  const { lettingId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(lettingId)) notFound();
  const member = await requireMember();
  const detail = await getLetting(member, lettingId);
  if (!detail) notFound();
  if (await stoppedByConflict(member, lettingId)) redirect('/lettings/yours');
  const lettingHref = `/lettings/${lettingId}`;
  if (!mayCloseEnquiries(detail.letting)) redirect(lettingHref);
  const now = new Date();
  const state = enquiryState(detail.letting.enquiriesCloseAt, now);
  if (state.state === 'open') {
    return (
      <StopForm
        action={stopEnquiriesAction.bind(null, lettingId)}
        leave={lettingHref}
        today={irishToday(now)}
        last={irishToday(new Date(now.getTime() + MAX_CLOSE_AHEAD_DAYS * 86_400_000))}
      />
    );
  }
  return (
    <StepForm
      action={reopenEnquiriesAction.bind(null, lettingId)}
      leave={{ kind: 'close', href: lettingHref }}
      title={copy.reopenTitle}
      lead={
        state.state === 'closed'
          ? copy.closedLead(formatDateTime(state.since, now))
          : copy.closingLead(formatDateTime(state.at, now))
      }
      primary={copy.reopen}
      pendingLabel={copy.reopening}
    />
  );
}
