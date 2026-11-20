import { describe, expect, it } from 'vitest';
import type { Tx } from '@/db/client';
import { downloadCopy, enquiryLine, keepCopy, profileCopy } from '@/copy/profile';
import { keptAnswersSchema, keptDetailsSchema, keptIncomeSchema } from '@/domain/profile/kept';
import { collectedAt, type RenterView } from '@/domain/renter/path';
import {
  profileEventCatalogue,
  recordProfileEvent,
  type ProfileEventType,
} from '@/server/accounts/profile-events';
import { freeTextFields } from './free-text';

const REACHED = 'a refused profile event reached the database';
const noDatabase = {
  insert() {
    throw new Error(REACHED);
  },
} as unknown as Tx;

describe('Compliance: a renter’s profile holds no free text and no protected ground (UX-PF-4, rule 3)', () => {
  it('UX-PF-4: the only string a profile keeps is a mobile number', () => {
    // Every other field is a number, a yes/no, a code or a date.
    expect(freeTextFields(keptAnswersSchema)).toEqual([]);
    expect(freeTextFields(keptIncomeSchema)).toEqual([]);
    expect(freeTextFields(keptDetailsSchema)).toEqual(['mobile']);
    expect(keptDetailsSchema.safeParse({ mobile: 'Two adults, one child' }).success).toBe(false);
  });

  it('rule 3: no field is named for a protected ground, a document or housing support', () => {
    const fields = [
      ...Object.keys(keptDetailsSchema.shape),
      ...Object.keys(keptAnswersSchema.shape),
      ...Object.keys(keptIncomeSchema.shape),
    ];
    expect(fields.sort()).toEqual(
      [
        'answers',
        'earning',
        'hasPets',
        'income',
        'mobile',
        'monthlyIncomeCents',
        'moveInDate',
        'occupants',
        'stayMonths',
      ].sort(),
    );
  });

  it('rule 3: the words on Profile and Enquiries never ask about a protected ground', () => {
    const views = Object.keys(collectedAt) as RenterView[];
    const lines = views.map((view) =>
      enquiryLine({
        view,
        operator: 'Halcyon Lettings',
        viewing: 'Friday 20 November, 6:15pm',
        place: 'Friday 20 November, 6:15pm',
        offerDeadline: 'Sunday 22 November, 6pm',
        checkToDo: true,
        tenantTask: 'sign',
        tenancyStart: 'Tuesday 1 December',
        deleteBy: 'Friday 18 December',
      }),
    );
    const words = JSON.stringify([profileCopy, keepCopy, downloadCopy, lines]).toLowerCase();
    for (const banned of [
      'hap',
      'housing assistance',
      'age',
      'gender',
      'married',
      'children',
      'family',
      'nationality',
      'religion',
      'disability',
      'traveller',
      'photo',
      'about you',
    ]) {
      expect(words, banned).not.toMatch(new RegExp(`\\b${banned}\\b`));
    }
    // UX-RH-1: every page a renter can be on has a line.
    expect(lines.every((line) => line.length > 0)).toBe(true);
  });
});

describe('Compliance: the record of a profile holds no personal data (rule 8, ADR-0006)', () => {
  for (const [type, schema] of Object.entries(profileEventCatalogue)) {
    it(`"${type}" allows no free-text fields`, () => {
      expect(freeTextFields(schema)).toEqual([]);
    });
  }

  it.each([
    ['a name', 'Aoife Byrne'],
    ['an email address', 'aoife.byrne@example.ie'],
    ['a phone number', '087 123 4567'],
  ])('rule 8: %s in a payload is refused before anything is written', async (_what, value) => {
    const attempt = recordProfileEvent(noDatabase, 'user-1', 'profile.details_changed', {
      part: value,
    } as never).then(
      () => null,
      (error: Error) => error,
    );
    const error = await attempt;
    expect(error).toBeInstanceOf(Error);
    expect(error!.message).not.toContain(REACHED);
  });

  it('rule 8: an event with codes and yes/no values is let through to be written', async () => {
    const types = Object.keys(profileEventCatalogue) as ProfileEventType[];
    expect(types).toContain('profile.deleted');
    const error = await recordProfileEvent(noDatabase, 'user-1', 'profile.deleted', {
      by: 'person',
      account: true,
    }).then(
      () => null,
      (problem: Error) => problem,
    );
    expect(error?.message).toBe(REACHED);
  });
});
