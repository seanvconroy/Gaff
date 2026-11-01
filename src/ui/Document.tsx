import type { ReactNode } from 'react';
import styles from './Document.module.css';

/** A document to read, sign and print, such as the tenancy agreement (R22). */
export function DocumentView({
  title,
  sections,
  signatures,
}: {
  title: string;
  sections: Array<{ heading: string; paragraphs: string[] }>;
  signatures?: ReactNode;
}) {
  return (
    <article className={styles.document} aria-labelledby="document-title">
      <h2 id="document-title" className="type-heading">
        {title}
      </h2>
      {sections.map((section) => (
        <section key={section.heading} className={styles.section}>
          <h3 className="type-title">{section.heading}</h3>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
      ))}
      {signatures ? <div className={styles.signatures}>{signatures}</div> : null}
    </article>
  );
}
