import type { Metadata } from 'next';
import { forwardingCopy } from '@/copy/forwarding';
import { forwardingFromQuery, forwardingLeaveHref } from '@/domain/enquiries/forwarding';
import { requireMember } from '@/server/auth/member';
import { noteForwardingOpened } from '@/server/enquiries/forwarding';
import { chooseServiceAction } from './actions';
import type { Query } from './parts';
import { ServiceStep } from './ServiceStep';

export const metadata: Metadata = { title: forwardingCopy.flow };

/**
 * Forwarding enquiries, screen 1 of 4 (UX-LT-17): which mail service the person's Daft
 * enquiries arrive in. Opened from a letting's "Set up forwarding" task, from Today, from
 * Settings, and straight after go-live for a home advertised on Daft or MyHome.
 */
export default async function ForwardingPage({ searchParams }: { searchParams: Query }) {
  const member = await requireMember();
  const from = forwardingFromQuery(await searchParams);
  await noteForwardingOpened(member);
  return (
    <ServiceStep
      action={chooseServiceAction.bind(null, from)}
      leaveHref={forwardingLeaveHref(from)}
    />
  );
}
