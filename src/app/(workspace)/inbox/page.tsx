import { Inbox, type LucideIcon, MessageCircleQuestionMark, Sparkles } from 'lucide-react';
import type { Metadata } from 'next';
import { type InboxRow, inboxRows } from '@/domain/navigation/inbox';
import { requireMember } from '@/server/auth/member';
import { dashboardForRequest } from '@/server/dashboard/dashboard';
import { ActionList, ActionRow, type TileTone } from '@/ui/ActionList';
import { PageHeader, Stack } from '@/ui/Layout';
import styles from '../dashboard.module.css';

export const metadata: Metadata = { title: 'Inbox' };

/** The same icon tiles as Today's rows: AI drafts in the AI colours, the rest quiet. */
const icons: Record<InboxRow['kind'], { Icon: LucideIcon; tone: TileTone }> = {
  approvals: { Icon: Sparkles, tone: 'ai' },
  questions: { Icon: MessageCircleQuestionMark, tone: 'quiet' },
  attention: { Icon: Inbox, tone: 'quiet' },
};

/**
 * Inbox (UX-NV-1, UX-NV-2): for now, the way to the three pages it takes over from, each with
 * how many are waiting. Work package WP-8 replaces this with one list of conversations.
 */
export default async function InboxPage() {
  const member = await requireMember();
  const { today } = await dashboardForRequest(member);
  return (
    <Stack gap={8}>
      <PageHeader title="Inbox" />
      <section className={styles.panel} aria-label="Waiting for you">
        <ActionList flush>
          {inboxRows(today).map((row) => (
            <ActionRow
              key={row.kind}
              id={`inbox-${row.kind}`}
              href={row.href}
              icon={icons[row.kind].Icon}
              tone={icons[row.kind].tone}
              title={row.title}
              meta={row.waiting}
            />
          ))}
        </ActionList>
      </section>
    </Stack>
  );
}
