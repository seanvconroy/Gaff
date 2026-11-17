import { Users } from 'lucide-react';
import Link from 'next/link';
import { lettingPageCopy } from '@/copy/letting-page';
import {
  chipsFor,
  type PeopleChip,
  type PeopleGroup,
  peopleIn,
  personHistory,
  standLine,
  statusWords,
} from '@/domain/lettings/people';
import type { PersonRow } from '@/server/lettings/page';
import { ChipLinks } from '@/ui/Chips';
import { EmptyState } from '@/ui/EmptyState';
import { StatusPill } from '@/ui/StatusPill';
import { Cell, Table } from '@/ui/Table';
import styles from './letting.module.css';
import { PersonSheet } from './PersonSheet';

const copy = lettingPageCopy.people;

/**
 * People (UX-LP-8 to UX-LP-10): everyone who enquired, in the order Gaff ranks them, with the
 * stage's chips. A card each on a phone, a table row each on a desktop, the same content either
 * way, and neither scrolls sideways (`Table`). Tapping a name opens their sheet. People shows;
 * it hides nobody and decides nothing (rule 1): decisions are made in their own flows.
 *
 * UX-LP-15, "Ask about who's enquired", is work package WP-25's: it will set these same chips.
 */
export function PeopleView({
  lettingId,
  people,
  group,
  chip,
  personId,
  live,
}: {
  lettingId: string;
  people: readonly PersonRow[];
  group: PeopleGroup;
  chip: PeopleChip;
  personId: string | null;
  live: boolean;
}) {
  const now = new Date();
  const base = `/lettings/${lettingId}?view=people`;
  const listHref = chip === 'all' ? base : `${base}&show=${chip}`;
  const shown = peopleIn(people, chip, group);
  const open = personId ? people.find((p) => p.id === personId) : undefined;

  if (people.length === 0) {
    return (
      <EmptyState icon={Users} title={copy.none.title}>
        <p>{live ? copy.none.live : copy.none.draft}</p>
      </EmptyState>
    );
  }

  return (
    <section className={styles.people} aria-labelledby="people-heading">
      <h2 id="people-heading" className="visually-hidden">
        {copy.heading}
      </h2>
      <ChipLinks
        label={copy.filter}
        items={chipsFor[group].map((key) => ({
          href: key === 'all' ? base : `${base}&show=${key}`,
          label: copy.chips[key] ?? key,
          current: key === chip,
        }))}
      />
      <p className={styles.small}>{copy.order}</p>
      {shown.length === 0 ? (
        <p className={styles.muted}>{copy.noneHere}</p>
      ) : (
        <Table caption={copy.caption} head={[...copy.head]}>
          {shown.map((person) => {
            const status = statusWords[person.status];
            return (
              <tr key={person.id}>
                <Cell label={copy.head[0]}>
                  <Link
                    href={`${listHref}&person=${person.id}`}
                    className={styles.person}
                    scroll={false}
                  >
                    {person.name}
                  </Link>
                </Cell>
                <Cell label={copy.head[1]}>{standLine(person, group, now)}</Cell>
                <Cell label={copy.head[2]}>
                  <StatusPill tone={status.tone}>{status.words}</StatusPill>
                </Cell>
              </tr>
            );
          })}
        </Table>
      )}
      {open ? (
        <PersonSheet
          key={open.id}
          closeHref={listHref}
          data={{
            name: open.name,
            status: statusWords[open.status],
            stand: standLine(open, group, now),
            deleted: open.deleted,
            fit: open.sheet.fit,
            told: open.sheet.told,
            income: open.sheet.income,
            checks: open.sheet.checks,
            happened: personHistory(open, now),
            conversationHref: open.sheet.conversationHref,
          }}
        />
      ) : null}
    </section>
  );
}
