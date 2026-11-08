import type { ReactNode } from 'react';
import styles from './Form.module.css';

/**
 * A titled group of fields. `card` (the default) stands on its own with a hairline edge; `plain`
 * sits inside a panel with other groups, separated by a hairline, so a form reads as one thing
 * rather than a stack of boxes.
 */
export function FormSection({
  id,
  title,
  lead,
  variant = 'card',
  children,
}: {
  id: string;
  title: string;
  lead?: ReactNode;
  variant?: 'card' | 'plain';
  children: ReactNode;
}) {
  return (
    <section className={variant === 'card' ? styles.section : styles.plain} aria-labelledby={id}>
      <div className={styles.sectionHeader}>
        <h2 id={id} className="type-title">
          {title}
        </h2>
        {lead ? <p className={styles.sectionLead}>{lead}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** One panel holding a whole form: sections inside it are `plain`. */
export function FormPanel({ children }: { children: ReactNode }) {
  return <div className={styles.panel}>{children}</div>;
}

/** Fields side by side on a laptop, one under another on a phone. They never stretch. */
export function Columns({ three, children }: { three?: boolean; children: ReactNode }) {
  return (
    // Fields inside share the row's tracks (Field.module.css), so their controls line up.
    <div className={three ? styles.columns3 : styles.columns} data-columns="">
      {children}
    </div>
  );
}

/** The form's buttons: the primary first, then anything quieter. */
export function FormActions({ children }: { children: ReactNode }) {
  return <div className={styles.actions}>{children}</div>;
}

export const formClass = styles.form;
