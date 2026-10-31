import type { ReactNode } from 'react';
import styles from './Table.module.css';

/** Dense operator table (body-sm), with a quiet header row. Scrolls sideways on phones. */
export function Table({
  caption,
  head,
  children,
}: {
  caption: string;
  head: string[];
  children: ReactNode;
}) {
  return (
    // Focusable and labelled, so keyboard users can scroll it sideways on a phone (WCAG 2.1.1).
    <div className={styles.wrap} role="region" aria-label={caption} tabIndex={0}>
      <table className={styles.table}>
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export const tableStyles = styles;
