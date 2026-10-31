import type { ReactNode } from 'react';
import styles from './Form.module.css';

/** A titled group of fields inside a form (card surface, hairline border). */
export function FormSection({
  id,
  title,
  lead,
  children,
}: {
  id: string;
  title: string;
  lead?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.section} aria-labelledby={id}>
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

export function Columns({ three, children }: { three?: boolean; children: ReactNode }) {
  return <div className={three ? styles.columns3 : styles.columns}>{children}</div>;
}

export function FormActions({ children }: { children: ReactNode }) {
  return <div className={styles.actions}>{children}</div>;
}

export const formClass = styles.form;
