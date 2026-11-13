'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import styles from './Popover.module.css';

/**
 * A button that opens a small panel under it (the disclosure pattern, non-modal): M58's quick
 * filters. It closes on Escape (focus goes back to the button) and on a click outside. The
 * button says its value when set, and looks selected.
 */
export function Popover({
  label,
  active = false,
  panelLabel,
  align = 'start',
  children,
}: {
  label: ReactNode;
  active?: boolean;
  /** The panel's name for screen readers: "Rent a month". */
  panelLabel: string;
  align?: 'start' | 'end';
  children: (close: () => void) => ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    // The first control in the panel gets focus, so keyboard users land where they need to be.
    panel.current?.querySelector<HTMLElement>('input, button, select')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    document.getElementById(`${id}-trigger`)?.focus();
  };

  return (
    <div ref={wrap} className={styles.wrap}>
      <button
        ref={button}
        id={`${id}-trigger`}
        type="button"
        className={styles.trigger}
        data-active={active || undefined}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{label}</span>
        <ChevronDown size={18} strokeWidth={2} aria-hidden="true" />
      </button>
      <div
        ref={panel}
        id={`${id}-panel`}
        role="dialog"
        aria-label={panelLabel}
        className={styles.panel}
        data-align={align}
        hidden={!open}
      >
        {open ? children(close) : null}
      </div>
    </div>
  );
}
