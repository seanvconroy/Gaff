import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withOrg } from '@/db/client';
import { activityMinutes, events, viewingSlots } from '@/db/schema';
import { recordActiveMinute } from '@/server/dashboard/activity';
import { dashboardFor } from '@/server/dashboard/dashboard';
import { setUsualTimes } from '@/server/organisations/usual-times';
import { inviteToView } from '@/server/shortlist/invite';
import { bookViewing } from '@/server/viewings/booking';
import { UserFacingError } from '@/server/errors';
import { createLetting } from '@/server/lettings/create-letting';
import { aLetting } from '../fixtures/lettings';
import { aLiveLetting, aRenterEnquires, createTestMember, tokenInMessage } from './helpers';

describe('R28: the dashboard', () => {
  it('lists who to decide on, and people to mark once their viewing starts', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    const first = await aRenterEnquires(member, 1, { occupants: '1', hasPets: 'no' });
    await aRenterEnquires(member, 2, { occupants: '1', hasPets: 'no' });

    let board = await dashboardFor(member);
    expect(board.today).toEqual([
      { kind: 'shortlist', lettingId, address: '12 Ranelagh Road', count: 2 },
    ]);
    expect(board.lettings[0]).toMatchObject({ stage: 'enquiries', undecided: 2, toMark: 0 });

    await inviteToView(member, lettingId, { chosenIds: [first], waitlistSize: 1 });
    const [slot] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(viewingSlots).where(eq(viewingSlots.lettingId, lettingId)).limit(1),
    );
    await bookViewing(await tokenInMessage(member, first, 'invitation'), slot!.id);
    board = await dashboardFor(member);
    expect(board.today).toEqual([]);

    // On the day: the viewing has started, so there's someone to mark.
    board = await dashboardFor(member, new Date(slot!.startsAt.getTime() + 5 * 60_000));
    expect(board.today).toEqual([
      { kind: 'attendance', lettingId, address: '12 Ranelagh Road', count: 1 },
    ]);
  });

  it('shows a letting still being set up', async () => {
    const member = await createTestMember();
    const { lettingId } = await createLetting(member, aLetting());
    const board = await dashboardFor(member);
    expect(board.today).toEqual([{ kind: 'setup', lettingId, address: '12 Ranelagh Road' }]);
  });

  it('compares time in Gaff with the usual time, counting each minute once', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    const at = new Date('2026-11-05T10:00:10Z');
    await recordActiveMinute(member, lettingId, at);
    await recordActiveMinute(member, lettingId, new Date('2026-11-05T10:00:50Z'));
    await recordActiveMinute(member, lettingId, new Date('2026-11-05T10:01:05Z'));
    await recordActiveMinute(member, null, new Date('2026-11-05T10:02:05Z'));
    expect(await setUsualTimes(member, { hoursPerLetting: '6.5', daysToLet: '30' })).toEqual({
      ok: true,
    });
    const board = await dashboardFor(member);
    expect(board.lettings[0]!.time).toEqual({ minutes: 2, usual: 390, saved: 388 });
    expect(board.usualDaysToLet).toBe(30);
    expect(board.otherMinutes).toBe(1);
  });

  it('never counts time against another organisation’s letting', async () => {
    const member = await createTestMember();
    const other = await createTestMember();
    const { lettingId } = await aLiveLetting(other);
    await recordActiveMinute(member, lettingId);
    const rows = await withOrg(member.organisationId, (tx) => tx.select().from(activityMinutes));
    expect(rows).toEqual([expect.objectContaining({ lettingId: null })]);
  });
});

describe('R28 and Q15: the usual times', () => {
  it('only an admin sets them, they’re checked, and the change is logged without personal data', async () => {
    const member = await createTestMember();
    await expect(
      setUsualTimes({ ...member, role: 'negotiator' }, { hoursPerLetting: '6', daysToLet: '' }),
    ).rejects.toThrow(UserFacingError);
    expect(await setUsualTimes(member, { hoursPerLetting: 'six', daysToLet: '0' })).toEqual({
      ok: false,
      errors: {
        hoursPerLetting: 'Enter the hours as a number, like 6 or 6.5.',
        daysToLet: 'Enter the days as a number, like 30.',
      },
    });
    expect(await setUsualTimes(member, { hoursPerLetting: '', daysToLet: '' })).toEqual({
      ok: true,
    });
    const logged = await withOrg(member.organisationId, (tx) =>
      tx.select().from(events).where(eq(events.type, 'settings.usual_times')),
    );
    expect(logged[0]?.data).toEqual({ minutesPerLetting: null, daysToLet: null });
  });
});
