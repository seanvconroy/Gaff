import type { ComponentProps, ReactNode } from 'react';
import styles from './Table.module.css';

/**
 * Dense operator table (body-sm), with a quiet header row. On a phone each row becomes a small
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

/** A table cell that knows its column's name, for the stacked view on a phone. */
export function Cell({
  label,
  children,
  ...td
}: { label: string; children?: ReactNode } & Omit<ComponentProps<'td'>, 'style'>) {
  return (
    <td {...td} data-label={label}>
      {children}
    </td>
  );
}

export const tableStyles = styles;
