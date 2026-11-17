import { Users } from 'lucide-react';
import Link from 'next/link';
import { askCopy, filterChipLabel } from '@/copy/fit';
import { lettingPageCopy } from '@/copy/letting-page';
import type { Criteria } from '@/domain/criteria/criteria';
import {
  answerChips,
  filterPeople,
  filterToParams,
  isEmptyFilter,
  MAX_QUESTION,
  type PeopleFilter,
  peopleHref,
} from '@/domain/fit/ask';
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
import { TextField } from '@/ui/Field';
import { Notice } from '@/ui/Notice';
import { StatusPill } from '@/ui/StatusPill';
import { SubmitButton } from '@/ui/SubmitButton';
import { Cell, Table } from '@/ui/Table';
import { askAboutPeopleAction } from './ask-actions';
import styles from './letting.module.css';
import { PersonSheet } from './PersonSheet';

const copy = lettingPageCopy.people;

/**
 * People (UX-LP-8 to UX-LP-10): everyone who enquired, in the order Gaff ranks them, with the
 * stage's chips. A card each on a phone, a table row each on a desktop, the same content either
 * way, and neither scrolls sideways (`Table`). Tapping a name opens their sheet. People shows;
 * it hides nobody and decides nothing (rule 1): decisions are made in their own flows.
 *
 * UX-LP-15: one box, "Ask about who's enquired". A question becomes the chips under "Their
 * answers", which can be set by tapping as well: a filter on the four answers and the time of
 * enquiry, and nothing else. Anything else is declined in fixed words that name nobody. A filter
 * only narrows the view, in the ranking's order, and says how many it shows of everyone
 * (UX-MT-8); clearing it shows everyone again.
 */
export function PeopleView({
  lettingId,
  people,
  group,
  chip,
  personId,
  live,
  criteria,
  filter,
  declined,
}: {
  lettingId: string;
  people: readonly PersonRow[];
  group: PeopleGroup;
  chip: PeopleChip;
  personId: string | null;
  live: boolean;
  criteria: Criteria;
  filter: PeopleFilter;
  /** A question was just declined: say so, in the fixed words. */
  declined: boolean;
}) {
  const now = new Date();
  const href = (at: { show?: PeopleChip; filter?: PeopleFilter; person?: string }) =>
    peopleHref(lettingId, { ...at, show: at.show ?? chip, filter: at.filter ?? filter });
  const listHref = href({});
  const inChip = peopleIn(people, chip, group);
  const shown = filterPeople(inChip, filter);
  const filtered = !isEmptyFilter(filter);
  const open = personId ? people.find((p) => p.id === personId) : undefined;

  if (people.length === 0) {
    return (
      <EmptyState icon={Users} title={copy.none.title}>
        <p>{live ? copy.none.live : copy.none.draft}</p>
      </EmptyState>
    );
  }

  const answers = answerChips(criteria, filter);
  return (
    <section className={styles.people} aria-labelledby="people-heading">
      <h2 id="people-heading" className="visually-hidden">
        {copy.heading}
      </h2>
      <form
        action={askAboutPeopleAction.bind(null, lettingId)}
        className={styles.ask}
        role="search"
        aria-label={askCopy.label}
      >
        <TextField
          name="question"
          label={askCopy.label}
          hint={askCopy.hint}
          autoComplete="off"
          maxLength={MAX_QUESTION}
          required
        />
        <input type="hidden" name="show" value={chip} />
        {filterToParams(filter).map(([key, value]) => (
          <input key={key} type="hidden" name={`f_${key}`} value={value} />
        ))}
        <div>
          <SubmitButton variant="secondary" pendingLabel={askCopy.asking} fullWidth="phone">
            {askCopy.button}
          </SubmitButton>
        </div>
      </form>
      {declined ? (
        <Notice tone="info" role="status">
          <p>{askCopy.declined}</p>
          <p>{askCopy.declinedNext}</p>
        </Notice>
      ) : null}
      {answers.length > 0 ? (
        <ChipLinks
          label={askCopy.chips}
          items={answers.map((each) => ({
            href: href({ filter: each.next }),
            label: filterChipLabel(each.key, each.part, now),
            current: each.current,
          }))}
        />
      ) : null}
      <ChipLinks
        label={copy.filter}
        items={chipsFor[group].map((key) => ({
          href: href({ show: key }),
          label: copy.chips[key] ?? key,
          current: key === chip,
        }))}
      />
      {filtered ? (
        <p className={styles.small} role="status">
          {askCopy.showing(shown.length, inChip.length)}{' '}
          <Link href={href({ filter: {} })} className={styles.change}>
            {askCopy.clear}
          </Link>
        </p>
      ) : (
        <p className={styles.small}>{copy.order}</p>
      )}
      {shown.length === 0 ? (
        <p className={styles.muted}>{filtered ? copy.noneFiltered : copy.noneHere}</p>
      ) : (
        <Table caption={copy.caption} head={[...copy.head]}>
          {shown.map((person) => {
            const status = statusWords[person.status];
            return (
              <tr key={person.id}>
                <Cell label={copy.head[0]}>
                  <Link href={href({ person: person.id })} className={styles.person} scroll={false}>
                    {person.name}
                  </Link>
                  {/* UX-AV-8: where they came from. A code about the enquiry, not the person. */}
                  {person.via ? (
                    <span className={styles.via}>
                      {copy.via} {person.via}
                    </span>
                  ) : null}
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
            answered: open.answeredAt !== null,
            asked: open.total > 0,
            fit: open.sheet.fit,
            fitRows: open.sheet.fitRows,
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
