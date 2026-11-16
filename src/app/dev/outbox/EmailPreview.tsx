'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './outbox.module.css';

/**
 * An email as a mail app would show it: the laid-out message (UX-PP-10) in a frame of its own,
 * so the page's styles can't reach it. No script runs in it. Its links open in this window, as
 * they would from a real inbox.
 */
export function EmailPreview({ html, title }: { html: string; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(480);
  const measure = useCallback(() => {
    const page = frame.current?.contentDocument?.documentElement;
    if (page && page.scrollHeight > 0) setHeight(page.scrollHeight);
  }, []);
  // The frame may have loaded before this component woke up.
  useEffect(measure, [measure]);
  return (
    <iframe
      ref={frame}
      className={styles.preview}
      title={title}
      srcDoc={html.replace('<head>', '<head><base target="_top">')}
      sandbox="allow-same-origin allow-top-navigation-by-user-activation"
      height={height}
      onLoad={measure}
    />
  );
}
