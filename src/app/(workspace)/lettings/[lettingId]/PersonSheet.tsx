'use client';

import { useRouter } from 'next/navigation';
import { lettingPageCopy } from '@/copy/letting-page';
import { ButtonLink } from '@/ui/Button';
import { Stack } from '@/ui/Layout';
import { Sheet } from '@/ui/Sheet';
import { StatusPill, type PillTone } from '@/ui/StatusPill';
import { SummaryList } from '@/ui/SummaryList';
import styles from './letting.module.css';

const copy = lettingPageCopy.people.sheet;

/** What one person's sheet shows (UX-LP-9). Only what their stage has collected is in it. */
export interface PersonSheetData {
  name: string;
  status: { tone: PillTone; words: string };
  stand: string;
  deleted: boolean;
  fit: string | null;
  told: ReadonlyArray<{ label: string; value: string }>;
  income: ReadonlyArray<{ label: string; value: string }>;
  checks: ReadonlyArray<{ label: string; text: string; tone: PillTone }>;
  happened: readonly string[];
  conversationHref: string;
}

/**
 * UX-LP-9: tapping a person opens this: what they've told Gaff so far, how they fit what was
 * asked and why, what's happened, and a link to their conversation in Inbox. It decides nothing
 * (rule 1). Closing it goes back to the list, as it was.
 */
export function PersonSheet({ data, closeHref }: { data: PersonSheetData; closeHref: string }) {
  const router = useRouter();
  return (
    <Sheet
      open
      onClose={() => router.replace(closeHref, { scroll: false })}
      title={data.name}
      description={data.stand}
    >
      <Stack gap={6}>
        <div>
          <StatusPill tone={data.status.tone}>{data.status.words}</StatusPill>
        </div>
        {data.deleted ? (
          <p>{copy.deleted}</p>
        ) : (
          <>
            <section className={styles.people} aria-labelledby="person-told">
              <h3 id="person-told" className="type-heading">
                {copy.told}
              </h3>
              {data.fit ? <p>{data.fit}</p> : null}
              <SummaryList rows={[...data.told, ...data.income]} />
            </section>
            {data.checks.length > 0 ? (
              <section className={styles.people} aria-labelledby="person-checks">
                <h3 id="person-checks" className="type-heading">
                  {copy.checks}
                </h3>
                <SummaryList
                  rows={data.checks.map((check) => ({
                    label: check.label,
                    value: check.text,
                  }))}
                />
              </section>
            ) : null}
          </>
        )}
        <section className={styles.people} aria-labelledby="person-happened">
          <h3 id="person-happened" className="type-heading">
            {copy.happened}
          </h3>
          <ul className={styles.list}>
            {data.happened.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
        {data.deleted ? null : (
          <div>
            <ButtonLink href={data.conversationHref} variant="secondary" fullWidth="phone">
              {copy.conversation}
            </ButtonLink>
          </div>
        )}
      </Stack>
    </Sheet>
  );
}
