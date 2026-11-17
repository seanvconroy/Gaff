import { Phone } from 'lucide-react';
import Link from 'next/link';
import { buttonProps } from './Button';
import styles from './ActionCard.module.css';

/**
 * The one action on a home's page (section 8, "Action card"; UX-LS-3, UX-LS-4): the rent, the
 * one primary button, a quiet "Call" where the lister gave a number, and the one reassurance line
 * under them. Two layouts either side of 900px (UX-DS-27): fixed to the foot of the screen on a
 * phone (above the tab bar, when there is one), and a card held to the right of the content on a
 * desktop. The same words and buttons either way.
 */
export function ActionCard({
  price,
  action,
  call,
  line,
  aboveTabBar = false,
  inPlace = false,
}: {
  /** "€1,850 a month". */
  price: string;
  /** The one primary action: "Ask to view". */
  action: { href: string; label: string };
  /**
   * "Call": `label` is what the button says, `name` what a screen reader hears, with the number
   * in it, and `href` the number to ring. Left out where the lister gave none (UX-LS-3).
   */
  call?: { label: string; name: string; href: string } | null;
  /** "Free. You'll hear back either way." */
  line: string;
  /** A signed-in visitor has the tab bar at the foot of a phone's screen: sit above it. */
  aboveTabBar?: boolean;
  /** Where it stands in the page at both widths, as on the component page (`/dev/ui`). */
  inPlace?: boolean;
}) {
  return (
    <>
      <aside
        className={`${styles.card} ${call ? styles.withCall : ''} ${aboveTabBar ? styles.aboveTabBar : ''} ${inPlace ? styles.inPlace : ''}`}
        aria-label={action.label}
        data-action-bar=""
      >
        <p className={styles.price}>{price}</p>
        <div className={styles.action}>
          <Link href={action.href} {...buttonProps('primary', true)}>
            {action.label}
          </Link>
        </div>
        {call ? (
          <div className={styles.call}>
            <a href={call.href} aria-label={call.name} {...buttonProps('quiet', true)}>
              <Phone size={20} strokeWidth={1.75} aria-hidden="true" />
              {call.label}
            </a>
          </div>
        ) : null}
        <p className={styles.line}>{line}</p>
      </aside>
      {/* On a phone the page ends clear of the fixed card. */}
      {inPlace ? null : <div className={styles.room} aria-hidden="true" />}
    </>
  );
}
