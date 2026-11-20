import Link from 'next/link';
import styles from './Wordmark.module.css';
import { wordmarkFullStop, wordmarkLetters, wordmarkSize } from './wordmarkPaths';

type WordmarkSize = 'regular' | 'small';

/**
 * The Gaff wordmark, as a drawing (UX-DS-22, Q29): "gaff." in Fraunces at its display optical
 * size, where the two "f"s meet and read as a key. The outlines come from the font itself
 * (scripts/wordmark/generate.py), so it is the lettering the product has always had, and it is
 * never set in live text. The letters take the colour of the text around them; the full stop is
 * the brand colour in either theme. `small` is 20px high, the least the key stays clear at
 * (UX-DS-23).
 */
export function WordmarkImage({ size = 'regular' }: { size?: WordmarkSize }) {
  return (
    <svg
      className={`${styles.image} ${styles[size]}`}
      viewBox={`0 0 ${wordmarkSize.width} ${wordmarkSize.height}`}
      role="img"
      aria-label="Gaff"
    >
      <path className={styles.letters} d={wordmarkLetters} />
      <path className={styles.fullStop} d={wordmarkFullStop} />
    </svg>
  );
}

/** The wordmark as the link home, at the top left of the product. */
export function Wordmark({ href = '/', size }: { href?: string; size?: WordmarkSize }) {
  return (
    <Link href={href} className={styles.link}>
      <WordmarkImage size={size} />
    </Link>
  );
}
