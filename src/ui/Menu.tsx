'use client';

import { Ellipsis, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import styles from './Menu.module.css';
import { Overlay } from './Overlay';
import { SheetHeader } from './Sheet';

const MenuContext = createContext<{ close: () => void }>({ close: () => undefined });

/**
 * Rare actions behind a "more" button (section 8, "Menu"). On a phone the actions come up as a
 * sheet; on a desktop they open beside the button. By keyboard: Enter, Space or the down arrow
 * opens it; the arrows, Home and End move; Enter chooses; Escape or Tab closes it and focus
 * returns to the button (UX-DS-21). Nothing here depends on hover or a long press (UX-DS-17).
 */
export function Menu({
  label,
  align = 'end',
  trigger,
  triggerLabel,
  header,
  children,
}: {
  /** What the button is for, for screen readers and as the sheet's title: "More for 12 Ranelagh Road". */
  label: string;
  align?: 'start' | 'end';
  /** What the button shows in place of the three dots: an `Avatar`, for the account menu. */
  trigger?: ReactNode;
  /**
   * The button's name for screen readers, where it shows words of its own: the name has to hold
   * the words on screen (WCAG 2.5.3), so an avatar reading "AP" is "AP, account".
   */
  triggerLabel?: string;
  /** Above the actions, and not one of them: whose menu this is. */
  header?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const close = () => setOpen(false);

  const items = () =>
    Array.from(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  // As it opens, the first action takes focus (after the dialog itself has opened).
  useEffect(() => {
    if (open) items()[0]?.focus();
  }, [open]);

  function onKeyDown(event: KeyboardEvent) {
    const all = items();
    const at = all.indexOf(document.activeElement as HTMLElement);
    const move: Record<string, number> = {
      ArrowDown: (at + 1) % all.length,
      ArrowUp: (at - 1 + all.length) % all.length,
      Home: 0,
      End: all.length - 1,
    };
    if (event.key in move) {
      event.preventDefault();
      all[move[event.key]!]?.focus();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      close();
    }
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`${styles.trigger} ${trigger ? styles.round : ''}`}
        aria-label={triggerLabel ?? label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {trigger ?? <Ellipsis size={20} strokeWidth={1.75} aria-hidden="true" />}
      </button>
      <Overlay
        open={open}
        onClose={close}
        kind="popover"
        anchor={button}
        align={align}
        labelledBy={titleId}
      >
        <SheetHeader id={titleId} title={label} onClose={close} phoneOnly />
        {header ? <div className={styles.header}>{header}</div> : null}
        <MenuContext.Provider value={{ close }}>
          <div
            ref={list}
            role="menu"
            aria-label={label}
            className={styles.list}
            onKeyDown={onKeyDown}
          >
            {children}
          </div>
        </MenuContext.Provider>
      </Overlay>
    </>
  );
}

/** One action: a link, or a button that does something. `destructive` is for deleting or cancelling. */
export function MenuItem({
  href,
  onSelect,
  icon: Icon,
  destructive,
  children,
}: {
  href?: string;
  onSelect?: () => void;
  icon?: LucideIcon;
  destructive?: boolean;
  children: ReactNode;
}) {
  const { close } = useContext(MenuContext);
  const className = `${styles.item} ${destructive ? styles.destructive : ''}`;
  const content = (
    <>
      {Icon ? <Icon size={20} strokeWidth={1.75} aria-hidden="true" /> : null}
      <span>{children}</span>
    </>
  );
  if (href) {
    return (
      <Link href={href} role="menuitem" className={className} onClick={close}>
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      role="menuitem"
      className={className}
      onClick={() => {
        close();
        onSelect?.();
      }}
    >
      {content}
    </button>
  );
}
