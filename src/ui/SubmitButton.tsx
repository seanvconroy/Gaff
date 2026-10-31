'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { buttonClass, type ButtonVariant } from './Button';

/** A form's submit button. While the form is sending it says so, and can't be pressed twice. */
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
  fullWidth?: boolean;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      className={buttonClass(variant, fullWidth)}
      aria-disabled={pending}
      disabled={pending}
    >
      {pending ? (pendingLabel ?? children) : children}
    </button>
  );
}
