import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './Prompt.module.css';

/**
 * A prompt (section 9, "Prompts, and when they appear"; UX-GR-5, UX-GR-6): one line with one
 * action, shown at the moment it's useful, in the page's own content. It is never a banner
 * across the top and never a pop-up: it blocks nothing, and can be passed by.
 *
 * `decline` is the quiet "Not now" a prompt that can wait carries: a form, so it works without
 * script. A screen shows one prompt at most: `promptFor` in `src/domain/activation` decides.
 */
export function Prompt({
  id,
  icon: Icon,
  title,
  children,
  action,
  decline,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  /** One line of why. */
  children?: ReactNode;
  /** Its one action: a secondary button, never the screen's primary. */
  action: ReactNode;
  /** "Not now", for a prompt that can wait. */
  decline?: ReactNode;
}) {
  return (
    <aside className={styles.prompt} aria-labelledby={`${id}-title`} data-prompt={id}>
      <span className={styles.tile} aria-hidden="true">
        <Icon size={20} strokeWidth={1.75} />
      </span>
      <div className={styles.words}>
        <h2 id={`${id}-title`} className={`${styles.title} type-body`}>
          {title}
        </h2>
        {children ? <div className={styles.text}>{children}</div> : null}
      </div>
      <div className={styles.actions}>
        {action}
        {decline}
      </div>
    </aside>
  );
}
