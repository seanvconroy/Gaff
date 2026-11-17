'use client';

import { Eye } from 'lucide-react';
import { useState, useTransition } from 'react';
import { buttonProps } from '@/ui/Button';
import { CopyButton } from '@/ui/CopyButton';
import styles from './rtb.module.css';

/**
 * UX-TN-3 (rule 2): the tenant's PPS number stays hidden, and out of the page, until "Show" is
 * pressed. Then it's fetched, shown, and can be copied like every other value on the screen.
 */
export function ShowPpsn({
  reveal,
  hiddenLabel,
  showLabel,
  what,
}: {
  reveal: () => Promise<string | null>;
  hiddenLabel: string;
  showLabel: string;
  what: string;
}) {
  const [value, setValue] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (value) {
    return (
      <span className={styles.value}>
        <span className={styles.text}>{value}</span>
        <CopyButton value={value} what={what} />
      </span>
    );
  }
  return (
    <span className={styles.value}>
      <span className={styles.text}>{hiddenLabel}</span>
      <button
        type="button"
        {...buttonProps('secondary')}
        aria-disabled={pending}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setValue(await reveal());
          })
        }
      >
        <Eye size={20} strokeWidth={1.75} aria-hidden="true" />
        <span>{showLabel}</span>
        <span className="visually-hidden"> {what}</span>
      </button>
    </span>
  );
}
