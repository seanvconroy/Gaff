'use client';

import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { breakpointPx } from '@/styles/tokens';
import styles from './Overlay.module.css';

/**
 * Above 900px a popover sits under its control, or over it where there's more room, and never
 * runs off the window: a long list scrolls inside it. Where that is depends on where the control
 * is on screen, which no token can say, so this is the one place a style is set from code. Below
 * 900px it is all cleared: the stylesheet makes it a sheet.
 */
function place(el: HTMLDialogElement, control: HTMLElement | null, align: 'start' | 'end') {
  el.style.removeProperty('left');
  el.style.removeProperty('top');
  el.style.removeProperty('max-height');
  if (!control || !window.matchMedia(`(width > ${breakpointPx}px)`).matches) return;
  const gap = 8;
  const at = control.getBoundingClientRect();
  const size = el.getBoundingClientRect();
  const roomBelow = window.innerHeight - at.bottom - 2 * gap;
  const roomAbove = at.top - 2 * gap;
  const below = size.height <= roomBelow || roomBelow >= roomAbove;
  const height = Math.min(size.height, below ? roomBelow : roomAbove);
  const left = align === 'end' ? at.right - size.width : at.left;
  el.style.left = `${Math.max(gap, Math.min(left, window.innerWidth - size.width - gap))}px`;
  el.style.top = `${below ? at.bottom + gap : at.top - gap - height}px`;
  if (height < size.height) el.style.maxHeight = `${height}px`;
}

/**
 * What every sheet, dialog, menu and picker stands on (UX-DS-21): the browser's own modal
 * `<dialog>`. So the page behind can't be reached, Tab stays inside, Escape closes, and focus
 * goes back to where it came from. Pressing the scrim closes it too.
 *
 * Two layouts, as every adaptive component has (UX-DS-27). Below 900px both kinds are a sheet
 * that slides up from the foot of the screen. Above it, `sheet` is a dialog in the middle of the
 * page, and `popover` sits beside the control that opened it.
 */
export function Overlay({
  open,
  onClose,
  kind,
  anchor,
  align = 'start',
  label,
  labelledBy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  kind: 'sheet' | 'popover';
  /** A popover's control: above 900px it opens beside it. */
  anchor?: RefObject<HTMLElement | null>;
  /** Which edge of its control a popover lines up with. */
  align?: 'start' | 'end';
  label?: string;
  labelledBy?: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (!open) {
      if (el.open) {
        el.close();
        // Focus returns to what opened it, if the browser hasn't already put it there.
        const from = opener.current;
        if (from?.isConnected && document.activeElement !== from) from.focus();
      }
      return;
    }
    if (!el.open) {
      opener.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      el.showModal();
    }
    if (kind !== 'popover') return;
    // Beside its control now, and still beside it if the page scrolls or the window changes.
    const update = () => place(el, anchor?.current ?? null, align);
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, kind, anchor, align]);

  return (
    <dialog
      ref={dialog}
      className={`${styles.overlay} ${styles[kind]}`}
      aria-label={label}
      aria-labelledby={labelledBy}
      // Escape: the browser asks to close; the owner's state decides.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // Closed by the browser itself (a form inside it, say): tell the owner. This event arrives a
      // moment after a close, so one from an earlier close is ignored if it has opened again.
      onClose={(event) => {
        if (open && !event.currentTarget.open) onClose();
      }}
      // The scrim is the dialog itself; everything else is inside `inner`.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.inner}>{open ? children : null}</div>
    </dialog>
  );
}
