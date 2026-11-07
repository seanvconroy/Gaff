import { Heart } from 'lucide-react';
import { toggleSaveAction } from './actions';
import styles from './public.module.css';

/** M60, M73, M85: save a home. The state is announced, and the button names the home. */
export function SaveButton({
  listingId,
  saved,
  returnTo,
  title,
}: {
  listingId: string;
  saved: boolean;
  returnTo: string;
  title: string;
}) {
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
