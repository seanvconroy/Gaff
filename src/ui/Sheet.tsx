'use client';

import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import styles from './Sheet.module.css';

/**
 * A modal sheet on the native <dialog>: M58's Filters, and the phone's search. A dialog in the
 * middle of the screen on larger screens; the whole screen on phones. Focus starts on the title,
 * stays inside, and goes back to whatever opened it on close; Escape and the close button close
 * it, and so does a click on the backdrop. `startOpen` shows it without JavaScript (not modal).
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  startOpen = false,
  size = 'medium',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  startOpen?: boolean;
  size?: 'medium' | 'full';
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement;
      d.showModal();
      d.querySelector<HTMLElement>(`#${CSS.escape(`${id}-title`)}`)?.focus();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open, id]);

  return (
    <dialog
      ref={dialog}
      className={styles.sheet}
      data-size={size}
      aria-labelledby={`${id}-title`}
      open={startOpen || undefined}
      onClose={() => {
        onClose();
        if (opener.current instanceof HTMLElement) opener.current.focus();
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
    >
      <div className={styles.inner}>
        <header className={styles.header}>
          <h2 id={`${id}-title`} tabIndex={-1} className={`type-title ${styles.title}`}>
            {title}
          </h2>
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            <X size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer ? <footer className={styles.footer}>{footer}</footer> : null}
      </div>
    </dialog>
  );
}
