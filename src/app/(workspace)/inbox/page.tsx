import { MessagesSquare } from 'lucide-react';
import type { Metadata } from 'next';
import { promptFor } from '@/domain/activation/prompts';
import { showFor } from '@/domain/inbox/conversations';
import { inboxPromptFactsFor } from '@/server/activation/activation';
import { requireMember } from '@/server/auth/member';
import { inboxFor } from '@/server/inbox/queries';
import { EmptyState } from '@/ui/EmptyState';
import { PromptLine } from '../PromptLine';
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
  const [{ conversations, leads }, { show: asked, done }, promptFacts] = await Promise.all([
    inboxFor(member, now),
    searchParams,
    inboxPromptFactsFor(member),
  ]);
  // UX-GR-5: the same question asked five times about one home: Gaff could answer it.
  const prompt = promptFor(
    'inbox',
    {
      viewer: {
        userId: member.userId,
        role: member.role,
        organisationKind: member.organisationKind,
        members: 0,
      },
      repeatedQuestion: promptFacts.repeatedQuestion,
    },
    promptFacts.declines,
    now,
  );
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
      prompt={<PromptLine prompt={prompt} back="/inbox" />}
    >
      <EmptyState icon={MessagesSquare} title="Choose a conversation">
        <p>It opens here, with anything Gaff has drafted ready to send.</p>
      </EmptyState>
    </InboxFrame>
  );
}
