'use client';

import { X } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Overlay } from './Overlay';
import styles from './Sheet.module.css';

/**
 * A short task over the page (section 8, "Sheet / dialog"). On a phone it slides up from the
 * bottom; on a desktop it is a dialog in the middle. The same title, content and buttons either
 * way. Focus moves in, Tab stays in, Escape and the Close button close it, and focus goes back to
 * what opened it (UX-DS-21).
 *
 * It is never an "Are you sure?": where an action can be undone, do it and offer Undo in a toast.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** One line under the title. */
  description?: ReactNode;
  /** The sheet's buttons: one primary, and anything quieter. They stay in view while it scrolls. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <Overlay open={open} onClose={onClose} kind="sheet" labelledBy={titleId}>
      <SheetHeader id={titleId} title={title} description={description} onClose={onClose} />
      <div className={styles.body}>{children}</div>
      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </Overlay>
  );
}

/** A sheet's title and its Close button. Menus and pickers show it in their phone layout. */
export function SheetHeader({
  id,
  title,
  description,
  onClose,
  phoneOnly,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  onClose: () => void;
  /** For a popover: the title and Close belong to the sheet it becomes below 900px. */
  phoneOnly?: boolean;
}) {
  return (
    <div className={`${styles.header} ${phoneOnly ? styles.phoneOnly : ''}`}>
      <div className={styles.titles}>
        <h2 id={id} className="type-title">
          {title}
        </h2>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
        <X size={20} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}
