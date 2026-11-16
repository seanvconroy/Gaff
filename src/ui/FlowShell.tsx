import { ArrowLeft, X } from 'lucide-react';
import Link from 'next/link';
import type { ComponentProps, ReactNode, Ref } from 'react';
import { needAnotherLook } from './flow';
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
 *
 * The rules every flow shares (section 4) live here and in the helpers below:
 * - UX-FL-1, UX-NV-6: the frame itself. A flow's page goes under the `(task)` routes, which have
 *   no navigation, and `leave` goes back to where the task was opened (`returnPath`).
 * - UX-FL-2: `saveAndExit` is for a flow that keeps a draft. Leave it out where nothing is kept
 *   yet, rather than promise it.
 * - UX-FL-3: errors go at the field. There is no error box at the top: on pressing the button
 *   with errors, call `focusFirstProblem` and give `FlowProblems` the count.
 * - UX-FL-4: a decision's last screen is an `Outcome` in this frame, with no progress: what was
 *   done, what Gaff does next and when, and one primary button onwards.
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

/**
 * "Save and exit" for a step that is a form: it sends the step's form, by its `id`, with
 * `intent=exit`, so what's typed is kept before the person leaves (UX-FL-2). The form's action
 * saves what it can and goes to where the task was opened. It sits outside the form, in the
 * header, which is why it names the form.
 */
export function FlowExitButton({
  form,
  children = 'Save and exit',
}: {
  /** The `id` given to the step's form (`FlowShell`'s `form={{ id }}`). */
  form: string;
  children?: ReactNode;
}) {
  return (
    <button
      type="submit"
      form={form}
      name="intent"
      value="exit"
      formNoValidate
      className={`${styles.exitLink} ${styles.exitButton}`}
    >
      {children}
    </button>
  );
}

/**
 * A flow's title: the question or the task's name, and at most two lines under it. Give `ref`
 * and it can take focus when a step opens, so screen readers hear where they are.
 */
export function FlowTitle({
  title,
  lead,
  ref,
}: {
  title: ReactNode;
  lead?: ReactNode;
  ref?: Ref<HTMLHeadingElement>;
}) {
  return (
    <div className={styles.titles}>
      <h1 ref={ref} tabIndex={ref ? -1 : undefined} className={`${styles.title} type-display`}>
        {title}
      </h1>
      {lead ? <p className={styles.lead}>{lead}</p> : null}
    </div>
  );
}

/**
 * One step of a flow whose steps share a page and a form: only the current step shows, and the
 * others keep what was typed. Once the user has moved, give `direction` and the step arrives as
 * any other does: from the right going forward, from the left on Back.
 */
export function FlowStep({
  current,
  direction,
  children,
}: {
  current: boolean;
  direction?: 'forward' | 'back';
  children: ReactNode;
}) {
  const arriving = direction === 'back' ? styles.fromLeft : direction ? styles.fromRight : '';
  return (
    <div hidden={!current} className={`${styles.part} ${arriving}`}>
      {children}
    </div>
  );
}

/**
 * UX-FL-3: what a screen reader hears when the primary button is pressed with errors: how many
 * fields need another look. Nothing is drawn: the errors themselves are at their fields. Keep it
 * in the page from the start, with 0, so the screen reader is already listening.
 */
export function FlowProblems({ count }: { count: number }) {
  return (
    <p className="visually-hidden" role="status">
      {count > 0 ? needAnotherLook(count) : ''}
    </p>
  );
}
