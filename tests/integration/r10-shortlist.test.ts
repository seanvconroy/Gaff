import { describe, expect, it } from 'vitest';
import { shortlistFor } from '@/server/shortlist/shortlist';
import { aLiveLetting, aRenterEnquires, createTestMember } from './helpers';

describe('R10: the shortlist', () => {
  it('ranks real enquiries by criteria met, then enquiry time, with a reason for each', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member); // up to 3 people, no pets
    const first = await aRenterEnquires(member, 1); // enquired first, hasn't answered
    const pets = await aRenterEnquires(member, 2, { occupants: '2', hasPets: 'yes' });
    const allMet = await aRenterEnquires(member, 3, { occupants: '3', hasPets: 'no' });

    const rows = await shortlistFor(member, lettingId);
    expect(rows.map((r) => r.id)).toEqual([allMet, pets, first]);
    expect(rows.map((r) => r.reason.split('. ')[0])).toEqual([
      'Meets all 2 criteria',
      'Meets 1 of 2 criteria (has pets)',
      'Hasn’t answered the questions yet',
    ]);
    expect(rows.every((r) => r.status === 'enquired')).toBe(true);
  });

  it('is not visible to another organisation', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    await aRenterEnquires(member, 1);
    expect(await shortlistFor(await createTestMember(), lettingId)).toEqual([]);
  });
});
