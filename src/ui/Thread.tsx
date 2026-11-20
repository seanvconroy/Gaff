import { AlertTriangle, Sparkles } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { BackLink } from './Layout';
import styles from './Thread.module.css';
import { OpenAtLatest } from './ThreadLatest';

/**
 * Thread and reply box (section 8): a conversation, like any messaging app, and the list of
 * conversations it is chosen from (UX-NV-13, UX-NV-14).
 *
 * Two layouts, one design. Below 900px the list is a screen and the open conversation is a
 * screen, with a way back. Above, the list is on the left and the conversation on the right.
 * The words and the steps are the same.
 */
export function ThreadLayout({
  open,
  list,
  children,
}: {
  /** Whether a conversation is open: below 900px it then takes the screen from the list. */
  open: boolean;
  list: ReactNode;
  /** The open conversation, or what to show beside the list when none is. */
  children: ReactNode;
}) {
  return (
    <div className={`${styles.layout} ${open ? styles.open : ''}`}>
      <div className={styles.listColumn}>{list}</div>
      <div className={styles.pane}>{children}</div>
    </div>
  );
}

/** The conversations, newest first: hairline rows, each a whole-row link. */
export function ConversationList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ul className={styles.conversations} aria-label={label}>
      {children}
    </ul>
  );
}

/**
 * One conversation in the list (UX-NV-13): who, which home, the last line and when. What is
 * waiting is said in words, in a pill, never by colour or weight alone.
 */
export function ConversationRow({
  href,
  who,
  role,
  home,
  lastLine,
  when,
  status,
  current,
}: {
  href: string;
  /** Who it is with: "Aoife". */
  who: string;
  /** "Owner", where it is the home's owner. */
  role?: string | null;
  /** The home, by its address. Left out for an email that belongs to none. */
  home?: string | null;
  lastLine: string;
  /** "6:12pm", "Yesterday", "Tuesday", "3 November". */
  when: string;
  /** A status pill: "Needs you". */
  status?: ReactNode;
  /** The conversation that is open beside the list. */
  current?: boolean;
}) {
  return (
    <li>
      <Link href={href} className={styles.conversation} aria-current={current ? 'true' : undefined}>
        <span className={styles.who}>
          {who}
          {role ? <span className={styles.role}> · {role}</span> : null}
        </span>
        <span className={styles.when}>{when}</span>
        {home ? <span className={styles.home}>{home}</span> : null}
        {lastLine ? <span className={styles.line}>{lastLine}</span> : null}
        {status ? <span className={styles.status}>{status}</span> : null}
      </Link>
    </li>
  );
}

/**
 * The top of an open conversation: who it is with and which home. Below 900px it carries the
 * way back to the list; above, the list is beside it.
 */
export function ThreadHeader({
  id,
  back,
  title,
  meta,
}: {
  id: string;
  back: { href: string; label: string };
  title: ReactNode;
  /** The home, by its address, or what the email is. */
  meta?: ReactNode;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.backRow}>
        <BackLink href={back.href}>{back.label}</BackLink>
      </div>
      <h2 id={id} className="type-heading">
        {title}
      </h2>
      {meta ? <p className={styles.headerMeta}>{meta}</p> : null}
    </header>
  );
}

/**
 * An open conversation: its header, what was said and the reply box. It opens at its latest,
 * as a messaging app does, so the reply box is in reach at once.
 */
export function OpenConversation({
  labelledBy,
  conversation,
  children,
}: {
  /** The id of the `ThreadHeader` that names it. */
  labelledBy: string;
  /**
   * The conversation's key, so each one opens at its latest. Left out where what matters is at
   * the top, as on an email Gaff couldn't place.
   */
  conversation?: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.conversationOpen} aria-labelledby={labelledBy}>
      {children}
      {conversation ? <OpenAtLatest conversation={conversation} /> : null}
    </section>
  );
}

/** What was said, oldest first. */
export function Thread({
  label,
  children,
}: {
  /** What a screen reader calls the list: "Messages with Aoife". */
  label: string;
  children: ReactNode;
}) {
  return (
    <ol className={styles.thread} aria-label={label}>
      {children}
    </ol>
  );
}

export type MessageFrom = 'them' | 'gaff' | 'you' | 'colleague';

/**
 * One message. Theirs sit on the left on the quiet fill; ours on the right, each saying who
 * sent it: the assistant ("Gaff", UX-AI-15), "You", or a colleague by first name (UX-NV-18).
 */
export function ThreadMessage({
  from,
  name,
  when,
  state = 'said',
  byText,
  children,
}: {
  from: MessageFrom;
  name: string;
  /** "6:12pm", or "Yesterday, 6:12pm". */
  when: string;
  /** `sending` is on its way; `not_sent` failed for good, and says so. */
  state?: 'said' | 'sending' | 'not_sent';
  /** It went as a text message. */
  byText?: boolean;
  children: ReactNode;
}) {
  return (
    <li className={`${styles.message} ${from === 'them' ? styles.theirs : styles.ours}`}>
      <p className={styles.meta}>
        <span className={styles.name}>
          {from === 'gaff' ? <Sparkles size={14} strokeWidth={2} aria-hidden="true" /> : null}
          {name}
          {from === 'gaff' ? <span className="visually-hidden">, the assistant</span> : null}
        </span>
        <span>
          {when}
          {byText ? ' · by text' : ''}
        </span>
        {state === 'sending' ? <span>Sending…</span> : null}
        {state === 'not_sent' ? (
          <span className={styles.notSent}>
            <AlertTriangle size={14} strokeWidth={2} aria-hidden="true" />
            Not sent
          </span>
        ) : null}
      </p>
      <div className={styles.bubble}>{children}</div>
    </li>
  );
}

/**
 * The reply box, at the foot of a conversation (UX-NV-14). It holds a draft that is already
 * written, the questions only a person can answer, or a message the person writes themselves.
 * Anything the AI drafted carries its pill.
 */
export function ReplyBox({
  id,
  title,
  pill,
  children,
}: {
  id: string;
  /** "Reply to Aoife". */
  title: ReactNode;
  /** `<DraftedByAi />`, on a draft the AI wrote. */
  pill?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.reply} aria-labelledby={id}>
      <div className={styles.replyHead}>
        <h3 id={id} className="type-title">
          {title}
        </h3>
        {pill}
      </div>
      {children}
    </section>
  );
}

/** A draft's words, as they will be sent. */
export function DraftText({ children }: { children: ReactNode }) {
  return <p className={styles.draftText}>{children}</p>;
}

/**
 * UX-NV-15: the part of a draft Gaff couldn't write, marked where it falls, holding the field
 * the person answers in.
 */
export function DraftGap({ children }: { children: ReactNode }) {
  return <div className={styles.gap}>{children}</div>;
}
