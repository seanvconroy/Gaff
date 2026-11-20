import { Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { buttonProps } from './Button';
import { controlClass } from './Field';
import styles from './SearchBox.module.css';

/**
 * The search box with chips (section 8, "Search box with chips"; UX-SR-3): one question, one box
 * that takes a sentence, and its button. Under it, `children` holds what was understood, as
 * chips. On a phone it is the column's full width and the chips scroll sideways; on a desktop it
 * is centred, up to 720px.
 *
 * The question is the page's heading and names the box. The box has no `name` beyond `words`:
 * what is typed goes only to `action`, never into the page's address.
 */
export function SearchBox({
  id,
  question,
  placeholder,
  submitLabel,
  action,
  primary = true,
  hidden = {},
  children,
}: {
  /** The heading's id, which names the search. */
  id: string;
  question: string;
  placeholder: string;
  submitLabel: string;
  action: string | ((formData: FormData) => void | Promise<void>);
  /** The Search button is the view's one primary button, unless something else is (UX-DS-2). */
  primary?: boolean;
  /** Settings carried with the words, such as `rent=1`. */
  hidden?: Record<string, string>;
  children?: ReactNode;
}) {
  return (
    <div className={styles.search}>
      <h1 id={id} className={styles.question}>
        {question}
      </h1>
      <form action={action} role="search" aria-labelledby={id} className={styles.form}>
        <span className={styles.field}>
          <Search className={styles.icon} size={20} strokeWidth={1.75} aria-hidden="true" />
          <input
            name="words"
            type="text"
            aria-labelledby={id}
            className={`${controlClass} ${styles.input}`}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            maxLength={500}
          />
        </span>
        <button type="submit" {...buttonProps(primary ? 'primary' : 'secondary')}>
          {submitLabel}
        </button>
        {Object.entries(hidden).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      </form>
      {children}
    </div>
  );
}
