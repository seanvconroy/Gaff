'use client';

import { Check, X } from 'lucide-react';
import { useFormStatus } from 'react-dom';
import styles from './attendance.module.css';

/** R15: one tap. Pressed shows the answer in colour, always with an icon and words. */
export function AttendanceToggle({ came, pressed }: { came: boolean; pressed: boolean }) {
  const { pending } = useFormStatus();
  const Icon = came ? Check : X;
  return (
    <button
      type="submit"
      aria-pressed={pressed}
      aria-disabled={pending}
      disabled={pending}
      className={[styles.toggle, came ? styles.came : styles.missed].join(' ')}
    >
      <Icon aria-hidden="true" size={20} strokeWidth={2.5} />
      {came ? 'Came' : 'Didn’t come'}
    </button>
  );
}
