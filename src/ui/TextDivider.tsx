import styles from './TextDivider.module.css';

/** A few words between two hairlines, such as "or use your email" between ways to sign in. */
export function TextDivider({ children }: { children: string }) {
  return (
    <p className={styles.divider}>
      <span>{children}</span>
    </p>
  );
}
