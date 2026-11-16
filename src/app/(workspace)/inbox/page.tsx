import { MessagesSquare } from 'lucide-react';
import type { Metadata } from 'next';
import { showFor } from '@/domain/inbox/conversations';
import { requireMember } from '@/server/auth/member';
import { inboxFor } from '@/server/inbox/queries';
import { EmptyState } from '@/ui/EmptyState';
import { InboxFrame } from './InboxFrame';

export const metadata: Metadata = { title: 'Inbox' };

/**
 * Inbox (UX-NV-13): every conversation with renters and owners, and each email Gaff couldn't
 * place, newest first. "Needs you" is the chip that is on whenever something is waiting.
 * Approvals, Questions and Needs attention are handled here, in the conversation (UX-NV-2).
 */
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string; done?: string }>;
}) {
  const member = await requireMember();
  const now = new Date();
  const [{ conversations, leads }, { show: asked, done }] = await Promise.all([
    inboxFor(member, now),
    searchParams,
  ]);
  const show = showFor(asked, conversations);
  return (
    <InboxFrame
      conversations={conversations}
      leads={leads}
      show={show}
      asked={asked === show ? show : null}
      open={null}
      done={done}
      now={now}
    >
      <EmptyState icon={MessagesSquare} title="Choose a conversation">
        <p>It opens here, with anything Gaff has drafted ready to send.</p>
      </EmptyState>
    </InboxFrame>
  );
}
