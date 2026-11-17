import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { answersBesideDetails, askCopy, criterionCost, fitDetail, poolSummary } from '@/copy/fit';
import { decisionsCopy } from '@/copy/decisions';
import { lettingPageCopy } from '@/copy/letting-page';
import { lettings } from '@/db/schema';
import {
  type Criteria,
  lettingDetailsFormSchema,
  lettingDetailsLine,
} from '@/domain/criteria/criteria';
import { filterPeople, peopleFilterSchema, readPeopleQuestion } from '@/domain/fit/ask';
import { poolCounts } from '@/domain/fit/fit';
import { draftAnswersSchema } from '@/domain/lettings/add-letting';
import { rank } from '@/domain/ranking/rank';

/**
 * Fit (work package WP-25, section 6 of the UX redesign): CLAUDE.md's rules 1 and 3 made
 * visible. Gaff never recommends a person; it shows who meets what was asked, and a person
 * chooses. Ranking reads only the criteria answers and the time of enquiry, and fit changes
 * nothing about it.
 */

const root = join(__dirname, '../..');
const src = join(root, 'src');

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesUnder(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** A file's code with its comments taken out, so only what it does is scanned. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const criteria: Criteria = {
  moveInBy: '2026-12-13',
  minStayMonths: 12,
  maxOccupants: 3,
  noPets: true,
};
const now = new Date('2026-11-17T12:00:00Z');

describe('UX-MT-3: the letting details line is Gaff’s, in fixed words, and can’t be edited', () => {
  it('UX-MT-3: a letting stores no line of its own: it has no free-text column but the address, the description and links', () => {
    const textColumns = Object.entries(getTableColumns(lettings))
      .filter(([, column]) => column.dataType === 'string' && column.columnType === 'PgText')
      .map(([name]) => name)
      .sort();
    expect(textColumns).toEqual(
      [
        'addressLine1',
        'addressLine2',
        'area',
        'berRating',
        'county',
        // A user's ID, and the step of adding a letting: codes, never words.
        'createdBy',
        'leadUserId',
        'setupStep',
        'daftUrl',
        'description',
        'eircode',
        'furnished',
        // Why Gaff's team hid it: one of four fixed reasons, a code (UX-TS-4).
        'hiddenReason',
        'myhomeUrl',
        'parking',
        'photosUrl',
        'propertyType',
        'publicRef',
      ].sort(),
    );
    // The criteria are a strict object of dates, numbers and yes/no: never words.
    expect(Object.keys(getTableColumns(lettings))).not.toContain('lettingDetails');
  });

  it('UX-MT-3: a line sent with the letting details form, or with a letting, is ignored', () => {
    const typed = 'Would suit a professional couple';
    const parsed = lettingDetailsFormSchema(now).parse({
      noPets: 'on',
      lettingDetails: typed,
      line: typed,
      lettingDetailsLine: typed,
    });
    expect(JSON.stringify(parsed)).not.toContain(typed);
    expect(lettingDetailsLine(parsed.criteria, parsed.noSmokingIndoors, now)).toBe(
      'No pets (assistance dogs always welcome)',
    );
    const letting = draftAnswersSchema.safeParse({ lettingDetailsLine: typed });
    expect(JSON.stringify(letting.data ?? {})).not.toContain(typed);
  });

  it('UX-MT-3: the fixed words are written in one place, and every page that shows them asks it', () => {
    const files = filesUnder(src);
    const writers = files
      .filter((path) => code(path).includes('assistance dogs always welcome'))
      .map((path) => relative(root, path));
    expect(writers).toEqual(['src/domain/criteria/criteria.ts']);
    // Each place the line appears gets it from that one function (adding a letting, the
    // letting's page, the home's public page, the owner's page, History).
    const shows = [
      'src/app/(task)/lettings/_flow/fields.tsx',
      'src/app/(task)/lettings/_flow/HomePreview.tsx',
      'src/app/(workspace)/lettings/[lettingId]/HomeView.tsx',
      'src/domain/homes/home-page.ts',
      'src/server/landlord/view.ts',
      'src/server/offers/approval.ts',
      'src/server/timeline/timeline.ts',
      'src/copy/owner.ts',
    ];
    for (const path of shows) {
      expect(code(join(root, path)), path).toMatch(/\blettingDetails(?:Line|Parts)\(/);
    }
  });
});

describe('UX-MT-2: ranking reads only the criteria answers and the time of enquiry, and is unchanged', () => {
  it('UX-MT-2: the ranking imports only the criteria, the answers and date formatting', () => {
    const imports = [...code(join(src, 'domain/ranking/rank.ts')).matchAll(/from '([^']+)'/g)].map(
      (m) => m[1],
    );
    expect(imports.sort()).toEqual(
      ['@/domain/criteria/answers', '@/domain/criteria/criteria', '@/lib/format'].sort(),
    );
  });

  it('UX-MT-2: nothing else about a person or the home changes anyone’s place', () => {
    const people = [
      {
        id: 'a',
        answers: { occupants: 4, hasPets: false },
        answered: true,
        enquiredAt: new Date(1),
      },
      {
        id: 'b',
        answers: { occupants: 2, hasPets: false },
        answered: true,
        enquiredAt: new Date(2),
      },
      { id: 'c', answers: null, answered: false, enquiredAt: new Date(0) },
    ];
    const plain = rank({ maxOccupants: 3, noPets: true }, people).map((r) => r.id);
    const dressed = rank(
      { maxOccupants: 3, noPets: true },
      people.map((p) => ({
        ...p,
        name: 'Aoife Byrne',
        sources: ['daft'],
        noSmokingIndoors: true,
        message: 'I am a nurse with a baby',
      })),
    ).map((r) => r.id);
    expect(dressed).toEqual(plain);
    expect(plain).toEqual(['b', 'a', 'c']);
  });

  it('UX-MT-2, UX-MT-8: a filter keeps the ranking’s order, and no filter is everyone', () => {
    const ranked = rank(criteria, [
      { id: 'a', answers: { ...fits, occupants: 6 }, answered: true, enquiredAt: new Date(1) },
      { id: 'b', answers: fits, answered: true, enquiredAt: new Date(2) },
      { id: 'c', answers: { ...fits, hasPets: true }, answered: true, enquiredAt: new Date(3) },
    ]).map((r) => ({ ...r, answers: byId[r.id]!, answeredAt: new Date(r.enquiredAt) }));
    expect(filterPeople(ranked, {}).map((r) => r.id)).toEqual(ranked.map((r) => r.id));
    expect(filterPeople(ranked, { pets: 'none' }).map((r) => r.id)).toEqual(['b', 'a']);
  });
});

const fits = { moveInDate: '2026-12-13', stayMonths: 12, occupants: 2, hasPets: false };
const byId: Record<string, typeof fits> = {
  a: { ...fits, occupants: 6 },
  b: fits,
  c: { ...fits, hasPets: true },
};

describe('UX-MT-8: nobody is hidden, removed or rejected for not fitting', () => {
  it('UX-MT-8: fit and asking change nothing: they never write, record or decide', () => {
    for (const path of [
      'src/domain/fit/fit.ts',
      'src/domain/fit/ask.ts',
      'src/server/lettings/ask.ts',
      'src/server/lettings/pool.ts',
      'src/copy/fit.ts',
    ]) {
      const text = code(join(root, path));
      expect(text, path).not.toMatch(
        /\.(insert|update|delete)\(|recordEvent|PersonDecision|decisions/,
      );
    }
  });
});

describe('UX-MT-7: the pool summary is written from counts, and names criteria, never people', () => {
  it('UX-MT-7: what it is written from holds no name, and what it says names no one', () => {
    const counts = poolCounts(criteria, [
      { answers: fits, answered: true },
      { answers: { ...fits, hasPets: true }, answered: true },
    ]);
    expect(JSON.stringify(counts)).not.toMatch(/[A-Z][a-z]+ [A-Z][a-z]+|@|name/);
    const words = [
      poolSummary(criteria, counts, now),
      ...counts.costs.map((cost) => JSON.stringify(criterionCost(criteria, cost, now))),
    ].join(' ');
    expect(words).toMatch(/Of 2 people who’ve answered, 1 meets everything/);
    expect(words).not.toMatch(/\b(?:he|she|him|her|they're)\b/i);
  });
});

describe('UX-MT-18, UX-AI-7: a question about anything but the four answers is declined, naming nobody', () => {
  it('UX-MT-18: the decline is the fixed sentence from section 4, and names nobody', () => {
    expect(askCopy.declined).toBe(
      'Gaff can sort people only by what you asked everyone: move-in date, length of stay, number of people and pets.',
    );
    expect(readPeopleQuestion('Is Aoife Byrne the best tenant?', '2026-11-17')).toEqual({
      kind: 'declined',
      why: 'not_allowed',
    });
  });

  it('UX-LP-15: a filter can hold only the four answers, whether they answered, and when they enquired', () => {
    expect(Object.keys(peopleFilterSchema.shape).sort()).toEqual(
      [
        'answered',
        'enquiredBefore',
        'enquiredFrom',
        'meetsAll',
        'moveInBy',
        'peopleAtMost',
        'pets',
        'stayAtLeast',
      ].sort(),
    );
  });
});

/** Words that recommend or judge a person (UX-MT-17). */
const RECOMMENDING =
  /\b(?:best|most suitable|suitab\w*|recommend\w*|ideal\w*|perfect|top pick|good tenant|great tenant|preferred tenant|most likely|winner|stand[- ]out)\b/i;

describe('UX-MT-17: Gaff never recommends a person', () => {
  it('UX-MT-17: operator-facing copy says who meets what was asked, never who is best', () => {
    for (const path of [
      'src/copy/fit.ts',
      'src/copy/letting-page.ts',
      'src/copy/decisions.ts',
      'src/copy/operator-emails.ts',
      'src/copy/owner.ts',
      'src/domain/lettings/people.ts',
      'src/domain/lettings/overview.ts',
      'src/domain/ranking/rank.ts',
      'src/domain/fit/fit.ts',
      'src/domain/fit/ask.ts',
    ]) {
      const strings = [...code(join(root, path)).matchAll(/(['`])((?:\\.|(?!\1).)*)\1/g)]
        .map((m) => m[2]!)
        // The ask reader's own list of words it declines is a pattern, not something said.
        .filter((text) => !text.startsWith('\\b'));
      for (const text of strings) expect(text, path).not.toMatch(RECOMMENDING);
    }
  });

  it('UX-MT-17: what the summary and answer generators write never recommends anyone', () => {
    const answers = [
      fits,
      { ...fits, occupants: 6 },
      { moveInDate: '2027-02-01', stayMonths: 6, occupants: 1, hasPets: true },
    ];
    const counts = poolCounts(
      criteria,
      answers.map((a) => ({ answers: a, answered: true })),
    );
    const written = [
      poolSummary(criteria, counts, now),
      ...counts.costs.map((cost) => criterionCost(criteria, cost, now).value),
      ...answers.flatMap((a) => fitDetail(criteria, a, now).map((row) => row.value)),
      ...answers.flatMap((a) => answersBesideDetails(criteria, a, now)),
      askCopy.declined,
      askCopy.declinedNext,
      ...Object.values(lettingPageCopy.people.chips),
      decisionsCopy.whoViews.metaTitle,
    ].join('\n');
    expect(written).not.toMatch(RECOMMENDING);
    expect(written).not.toMatch(/%|score|stars?\b|rating/i);
  });
});
