import { Heart } from 'lucide-react';
import { toggleSaveAction } from './actions';
import styles from './public.module.css';

/** M60, M73, M85: save a home. The state is announced, and the button names the home. */
export function SaveButton({
  listingId,
  saved,
  returnTo,
  title,
  variant = 'text',
}: {
  listingId: string;
  saved: boolean;
  returnTo: string;
  title: string;
  /** M60: on a result card, a heart on the photo; elsewhere, a button with words. */
  variant?: 'text' | 'icon';
}) {
  if (variant === 'icon') {
    return (
      <form action={toggleSaveAction.bind(null, listingId, returnTo)} className={styles.saveForm}>
        <input type="hidden" name="save" value={saved ? '0' : '1'} />
        <button type="submit" className={styles.saveIcon} aria-pressed={saved}>
          <Heart
            size={22}
            strokeWidth={1.75}
            fill={saved ? 'currentColor' : 'none'}
            aria-hidden="true"
          />
          <span className="visually-hidden">
            {saved ? 'Saved' : 'Save'} {title}
          </span>
        </button>
      </form>
    );
  }
  return (
    <form action={toggleSaveAction.bind(null, listingId, returnTo)} className={styles.saveForm}>
      <input type="hidden" name="save" value={saved ? '0' : '1'} />
      <button type="submit" className={styles.save} aria-pressed={saved}>
        <Heart
          size={24}
          strokeWidth={1.5}
          fill={saved ? 'currentColor' : 'none'}
          aria-hidden="true"
        />
        <span>{saved ? 'Saved' : 'Save'}</span>
        <span className="visually-hidden"> {title}</span>
      </button>
    </form>
  );
}
