import type { ComponentProps, ReactNode } from 'react';
import styles from './Table.module.css';

/**
 * An operator table at body size (UX-DS-9), with a quiet header row in sentence case. On a phone each row becomes a small
 * card, with each cell's column name beside it (design system: tables become stacked cards), so
 * nothing scrolls sideways. Rows use `Cell`, which carries its column name for that view.
 */
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
    // Focusable and labelled, so keyboard users can scroll it sideways if it's ever wider than the
    // screen (WCAG 2.1.1).
    <div className={styles.wrap} role="region" aria-label={caption} tabIndex={0}>
      <table className={styles.table}>
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {head.map((h, index) => (
              <th key={`${h}-${index}`} scope="col">
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

/**
 * A table cell that knows its column's name, for the stacked view on a phone. Its content is one
 * piece beside the name, however many lines it has (a name with where they came from under it).
 * `bare` leaves the column name out on a phone, for a cell that says what it is by itself: the
 * card's name at the top, a sentence, a status pill. The table's header still names it for screen
 * readers.
 */
export function Cell({
  label,
  bare,
  children,
  ...td
}: { label: string; bare?: boolean; children?: ReactNode } & Omit<ComponentProps<'td'>, 'style'>) {
  return (
    <td {...td} data-label={bare ? undefined : label} data-bare={bare ? '' : undefined}>
      {children === undefined || children === null || children === false ? null : (
        <div>{children}</div>
      )}
    </td>
  );
}

export const tableStyles = styles;
