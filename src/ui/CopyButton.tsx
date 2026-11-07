'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { buttonClass, type ButtonVariant } from './Button';

/**
 * Copies a value people would otherwise retype: an IBAN, a payment reference, a Gaff address.
 * Says "Copied" for a moment, and screen readers hear it.
 */
export function CopyButton({
  value,
  label = 'Copy',
  what,
  variant = 'secondary',
}: {
  value: string;
  label?: string;
  /** What's copied, for screen readers: "Copy the IBAN". */
  what?: string;
  variant?: ButtonVariant;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={buttonClass(variant)}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2500);
        });
      }}
    >
      {copied ? (
        <Check size={18} strokeWidth={2} aria-hidden="true" />
      ) : (
        <Copy size={18} strokeWidth={1.75} aria-hidden="true" />
      )}
      <span aria-live="polite">{copied ? 'Copied' : label}</span>
      {what && !copied ? <span className="visually-hidden"> {what}</span> : null}
    </button>
  );
}
