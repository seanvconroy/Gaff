import styles from './MessagePreview.module.css';

/**
 * Message preview (section 8): a fixed message as the person will get it, to read and not to
 * edit (rule 7, Q6). The subject, then the words, paragraph by paragraph. One layout at every
 * width.
 */
export function MessagePreview({
  subject,
  body,
  label,
}: {
  subject: string;
  body: string;
  /** What it is, for screen readers: "The invitation". */
  label: string;
}) {
  const paragraphs = body.split(/\n{2,}/);
  return (
    <figure className={styles.preview} aria-label={label}>
      <p className={styles.subject}>{subject}</p>
      {paragraphs.map((paragraph, index) => (
        <p key={index} className={styles.paragraph}>
          {paragraph}
        </p>
      ))}
    </figure>
  );
}
