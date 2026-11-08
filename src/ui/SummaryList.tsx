import type { ReactNode } from 'react';
import styles from './SummaryList.module.css';

export interface SummaryRow {
  label: ReactNode;
  value: ReactNode;
  /** A quiet action for this row, such as a "Change" link. */
  action?: ReactNode;
}

/**
 * Label and value rows divided by hairlines (GOV.UK's summary list): key facts, an offer's
 * terms, payment details. `split` puts the value on the right in semibold, for short figures
 * read at a glance; the default keeps labels in a column, for longer values.
 */
export function SummaryList({
  rows,
  layout = 'columns',
}: {
  rows: ReadonlyArray<SummaryRow>;
  layout?: 'columns' | 'split';
}) {
  return (
    <dl className={`${styles.list} ${styles[layout]}`}>
      {rows.map((row, index) => (
        <div key={index} className={styles.row}>
          <dt className={styles.label}>{row.label}</dt>
          <dd className={styles.value}>{row.value}</dd>
          {row.action ? <dd className={styles.action}>{row.action}</dd> : null}
        </div>
      ))}
    </dl>
  );
}
