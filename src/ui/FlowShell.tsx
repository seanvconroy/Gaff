import { ArrowLeft, X } from 'lucide-react';
import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import styles from './FlowShell.module.css';
import { SegmentedProgress } from './SegmentedProgress';

/**
 * The frame of any step-by-step task (section 8, "Flow shell"): nothing on screen but the task.
 * At the top, a way out (close, or back to the step before), the progress, and "Save and exit".
 * In the middle, one step. At the foot, a fixed bar with Back and the one primary button.
 *
 * On a phone it fills the screen and the primary button spans the width. On a desktop the same
 * header and footer hold a 640px column in the middle. The steps, their order and their words are
 * the same at every width (UX-DS-25).
 *
 * Give `form` to make the step and its footer one form, so the footer's button sends the step.
 */
export function FlowShell({
  leave,
  progress,
  saveAndExit,
  back,
  primary,
  form,
  direction = 'forward',
  children,
}: {
  /** The way out, top left: `close` leaves the task, `back` goes to the step before. */
  leave: { kind: 'close' | 'back'; href: string; label?: string };
  progress?: ComponentProps<typeof SegmentedProgress>;
  /** Top right: a `FlowExit` link, or a button that saves first. */
  saveAndExit?: ReactNode;
  /** The footer's quiet button, usually Back. Left out on the first step. */
  back?: ReactNode;
  /** The footer's one primary button. Pass `fullWidth="phone"` so it spans a phone's width. */
  primary: ReactNode;
  form?: Omit<ComponentProps<'form'>, 'className' | 'style' | 'children'>;
  /** Which way this step arrived: a step forward slides in from the right, Back from the left. */
  direction?: 'forward' | 'back';
  children: ReactNode;
}) {
  const LeaveIcon = leave.kind === 'close' ? X : ArrowLeft;
  const body = (
    <>
      <main className={styles.main}>
        <div className={`${styles.step} ${direction === 'back' ? styles.fromLeft : ''}`}>
          {children}
        </div>
      </main>
      {/* data-flow-footer: the page keeps whatever has focus clear of the fixed bar. */}
      <footer className={styles.footer} data-flow-footer="">
        <div className={styles.footerInner}>
          {back ? <div className={styles.back}>{back}</div> : null}
          <div className={styles.primary}>{primary}</div>
        </div>
      </footer>
    </>
  );
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.bar}>
          <Link
            href={leave.href}
            className={styles.leave}
            aria-label={leave.label ?? (leave.kind === 'close' ? 'Close' : 'Back')}
          >
            <LeaveIcon size={24} strokeWidth={1.75} aria-hidden="true" />
          </Link>
          {saveAndExit ? <div className={styles.exit}>{saveAndExit}</div> : null}
        </div>
        {progress ? <SegmentedProgress {...progress} /> : null}
      </header>
      {form ? (
        <form {...form} className={styles.body}>
          {body}
        </form>
      ) : (
        <div className={styles.body}>{body}</div>
      )}
    </div>
  );
}

/** "Save and exit": what's entered so far is kept, and the task can be picked up later (P10). */
export function FlowExit({
  href,
  children = 'Save and exit',
}: {
  href: string;
  children?: ReactNode;
}) {
  return (
    <Link href={href} className={styles.exitLink}>
      {children}
    </Link>
  );
}
