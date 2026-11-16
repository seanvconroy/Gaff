import { CircleCheck, Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  type Conversation,
  conversationHref,
  conversationsIn,
  inboxHref,
  type Show,
  waitingWords,
} from '@/domain/inbox/conversations';
import { whenWords } from '@/domain/inbox/thread';
import { ChipLinks } from '@/ui/Chips';
import { EmptyState } from '@/ui/EmptyState';
import { PageHeader, Stack } from '@/ui/Layout';
import { StatusPill } from '@/ui/StatusPill';
import { ConversationList, ConversationRow, ThreadLayout } from '@/ui/Thread';
import { Done } from './Done';
import { doneMessage } from './done';
import styles from './inbox.module.css';

/**
 * Inbox (UX-NV-13, UX-NV-14): the list of conversations, newest first, under two chips, and
 * the open conversation beside it. Below 900px the open conversation has the screen, with
 * "Inbox" as the way back; the words and the steps are the same at every width.
 */
export function InboxFrame({
  conversations,
  leads,
  show,
  asked,
  open,
  done,
  now,
  children,
}: {
  conversations: readonly Conversation[];
  /** The names of the people on the team, by user ID: who a waiting conversation waits for. */
  leads: ReadonlyMap<string, string>;
  /** The chip that is on. */
  show: Show;
  /** The chip the address asked for, if it did: links keep it. */
  asked: Show | null;
  /** The key of the conversation that is open, if one is. */
  open: string | null;
  /** The code for what was just done, from the address. */
  done?: string;
  now: Date;
  /** The open conversation, or what stands beside the list when none is. */
  children: ReactNode;
}) {
  const listed = conversationsIn(show, conversations);
  const chip = (to: Show) => (open ? conversationHref(open, to) : inboxHref(to));
  const said = doneMessage(done);
  return (
    <Stack gap={6}>
      {said ? <Done message={said} /> : null}
      <div className={open ? styles.titleWhenOpen : undefined}>
        <PageHeader title="Inbox" />
      </div>
      {conversations.length === 0 ? (
        <EmptyState icon={Inbox} title="No conversations yet">
          <p>
            When someone asks about one of your homes, Gaff answers and the conversation appears
            here. Anything that needs you is marked.
          </p>
        </EmptyState>
      ) : (
        <ThreadLayout
          open={open !== null}
          list={
            <div className={styles.list}>
              <ChipLinks
                label="Show"
                items={[
                  { href: chip('needs-you'), label: 'Needs you', current: show === 'needs-you' },
                  { href: chip('all'), label: 'All', current: show === 'all' },
                ]}
              />
              {listed.length === 0 ? (
                <EmptyState icon={CircleCheck} title="Nothing needs you">
                  <p>Every conversation is answered. New ones that need you show here.</p>
                </EmptyState>
              ) : (
                <ConversationList label="Conversations">
                  {listed.map((conversation) => {
                    const waiting = waitingWords(
                      conversation,
                      conversation.leadUserId ? (leads.get(conversation.leadUserId) ?? null) : null,
                    );
                    return (
                      <ConversationRow
                        key={conversation.key}
                        href={conversationHref(conversation.key, asked)}
                        who={conversation.who}
                        role={conversation.role}
                        home={conversation.home}
                        lastLine={conversation.lastLine}
                        when={whenWords(conversation.at, now)}
                        current={conversation.key === open}
                        status={
                          waiting ? (
                            <StatusPill tone={conversation.needsYou ? 'info' : 'neutral'}>
                              {waiting}
                            </StatusPill>
                          ) : undefined
                        }
                      />
                    );
                  })}
                </ConversationList>
              )}
            </div>
          }
        >
          {children}
        </ThreadLayout>
      )}
    </Stack>
  );
}
