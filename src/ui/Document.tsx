import type { ReactNode } from 'react';
import styles from './Document.module.css';

const sectionId = (index: number) => `section-${index + 1}`;

/**
 * A document to read, sign and print, such as the tenancy agreement (R22). Give `contents` and
 * it opens with links that jump to each section (UX-RN-21), so nobody scrolls a long agreement
 * on a phone to find the part they want.
 */
export function DocumentView({
  title,
  sections,
  signatures,
  contents,
}: {
  title: string;
  sections: Array<{ heading: string; paragraphs: string[] }>;
  signatures?: ReactNode;
  /** The name of the list of section links: "In this agreement". */
  contents?: string;
}) {
  return (
    <article className={styles.document} aria-labelledby="document-title">
      <h2 id="document-title" className="type-title">
        {title}
      </h2>
      {contents ? (
        <nav aria-label={contents} className={styles.contents}>
          <p className={styles.contentsTitle}>{contents}</p>
          <ol className={styles.links}>
            {sections.map((section, index) => (
              <li key={section.heading}>
                <a href={`#${sectionId(index)}`} className={styles.link}>
                  {section.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      {sections.map((section, index) => (
        <section key={section.heading} id={sectionId(index)} className={styles.section}>
          <h3 className="type-heading">{section.heading}</h3>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
      ))}
      {signatures ? <div className={styles.signatures}>{signatures}</div> : null}
    </article>
  );
}
