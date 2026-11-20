'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from './Button';
import styles from './ShowMore.module.css';

const noChange = () => () => {};

/**
 * Long text, three lines of it, then "Show more" (section 8, "Show more"; UX-LS-6, P3). The
 * button is there only when there is more to show, and "Show less" closes it again. Without
 * JavaScript all of it shows, and a screen reader hears all of it either way: the lines are only
 * hidden from view.
 */
export function ShowMore({
  paragraphs,
  more = 'Show more',
  less = 'Show less',
}: {
  paragraphs: readonly string[];
  more?: string;
  less?: string;
}) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  // Clamped only in the browser, where the button can open it again.
  const ready = useSyncExternalStore(
    noChange,
    () => true,
    () => false,
  );
  const [longer, setLonger] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el || !ready || open) return;
    const measure = () => setLonger(el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ready, open]);

  return (
    <div className={styles.showMore}>
      <div id={id} ref={box} className={`${styles.text} ${ready && !open ? styles.clamped : ''}`}>
        {paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
      {longer || open ? (
        <div className={styles.toggle}>
          <Button
            variant="quiet"
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setOpen((was) => !was)}
          >
            {open ? less : more}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
