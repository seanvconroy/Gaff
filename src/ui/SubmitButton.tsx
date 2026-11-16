'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { buttonClass, type ButtonVariant, type ButtonWidth } from './Button';

/**
 * A form's submit button. While the form is sending it can't be pressed twice, and the button
 * that was pressed says so. Where a form has two (`name` and `value` tell them apart, as "Send"
 * and "Don't send" do), only the one pressed changes its words.
 */
export function SubmitButton({
  children,
  pendingLabel,
  variant = 'primary',
  fullWidth,
  name,
  value,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: ButtonVariant;
  fullWidth?: ButtonWidth;
  name?: string;
  value?: string;
}) {
  const { pending, data } = useFormStatus();
  const pressed = name && value !== undefined && data?.has(name) ? data.get(name) === value : true;
  return (
    <button
      type="submit"
      name={name}
      value={value}
      className={buttonClass(variant, fullWidth)}
      aria-disabled={pending}
      disabled={pending}
    >
      {pending && pressed ? (pendingLabel ?? children) : children}
    </button>
  );
}
