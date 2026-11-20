import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withOrg, withSystem } from '@/db/client';
import { applications, lettingDailyCounts, lettings, waitingEnquiries } from '@/db/schema';
import { irishToday } from '@/lib/format';
import { askToView, asksToViewLimited } from '@/server/enquiries/ask-to-view';
import { countPageOpen, homeNumbersFor, sweepHomeCounts } from '@/server/lettings/home-numbers';
import { addPhoto } from '@/server/lettings/photos';
import { saveHome } from '@/server/saved/homes';
import { aPng } from '../fixtures/photos';
import {
  aLiveLetting,
  aRenterEnquires,
  createTestMember,
  createTestPerson,
  type Member,
} from './helpers';

const DAY = 86_400_000;
const BROWSER =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';

async function aHomeOnGaff(member: Member, addressLine1 = '1 Pearse Street') {
  const { lettingId } = await aLiveLetting(member, {
    addressLine1,
    area: 'Castlebar',
    county: 'Mayo',
    eircode: '',
  });
  await addPhoto(member, lettingId, aPng([36, 99, 168]));
  const [row] = await withOrg(member.organisationId, (tx) =>
    tx.select({ ref: lettings.publicRef }).from(lettings).where(eq(lettings.id, lettingId)),
  );
  return { lettingId, ref: row!.ref };
}

describe('M92: a lister’s numbers for a home, without cookies', () => {
  it('M92: page opens, saves and enquiries by day, as counts only', async () => {
    const lister = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(lister);
    expect(await countPageOpen(ref, BROWSER)).toBe('counted');
    expect(await countPageOpen(ref, BROWSER)).toBe('counted');
    // A robot, or a reference with no page, isn't counted.
    expect(await countPageOpen(ref, 'Googlebot/2.1 (+http://www.google.com/bot.html)')).toBe(
      'ignored',
    );
    expect(await countPageOpen('ffffffffffff', BROWSER)).toBe('ignored');
    const renter = await createTestPerson();
    await saveHome(renter.id, ref);
    // Saving it again isn't another save.
    await saveHome(renter.id, ref);
    await aRenterEnquires(lister, 1);

    const numbers = await homeNumbersFor(lister, lettingId);
    expect(numbers.days).toHaveLength(14);
    expect(numbers.days[0]).toEqual({ day: irishToday(), opened: 2, saved: 1, enquiries: 1 });
    expect(numbers.totals).toEqual({ opened: 2, saved: 1, enquiries: 1 });

    // Nothing about who: the counts table holds a letting, a day and two numbers.
    const { rows } = await db().execute<{ column: string }>(sql`
      select column_name as column from information_schema.columns
      where table_schema = 'public' and table_name = 'letting_daily_counts' order by column_name`);
    expect(rows.map((row) => row.column)).toEqual([
      'day',
      'letting_id',
      'opened',
      'organisation_id',
      'saved',
    ]);
    // Another organisation's path sees none of it.
    const other = await createTestMember();
    expect(
      await withOrg(other.organisationId, (tx) =>
        tx.select().from(lettingDailyCounts).where(eq(lettingDailyCounts.lettingId, lettingId)),
      ),
    ).toEqual([]);
  });

  it('M92, rule 9: counts are deleted after 13 months', async () => {
    const lister = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(lister, '3 Pearse Street');
    await countPageOpen(ref, BROWSER, new Date(Date.now() - 401 * DAY));
    await countPageOpen(ref, BROWSER);
    const kept = () =>
      withSystem((tx) =>
        tx.select().from(lettingDailyCounts).where(eq(lettingDailyCounts.lettingId, lettingId)),
      );
    expect(await kept()).toHaveLength(2);
    await sweepHomeCounts();
    expect((await kept()).map((row) => row.day)).toEqual([irishToday()]);
  });
});

describe('M82: a limit on asking to view', () => {
  it('M82: 30 a day from one network address or one person, then a plain refusal', async () => {
    const address = new Headers({ 'x-forwarded-for': '203.0.113.53' });
    const now = new Date();
    for (let i = 0; i < 30; i++) {
      expect(await asksToViewLimited(address, `person:${i}`, now)).toBe(false);
    }
    expect(await asksToViewLimited(address, 'person:31', now)).toBe(true);
    // Another address, another person: not limited.
    expect(
      await asksToViewLimited(new Headers({ 'x-forwarded-for': '203.0.113.54' }), 'x', now),
    ).toBe(false);
    // The next day, it's open again.
    expect(
      await asksToViewLimited(address, 'person:32', new Date(now.getTime() + DAY + 1000)),
    ).toBe(false);
  });

  it('M82: one person over 30 a day, from any address, is refused, and nothing is placed', async () => {
    const lister = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(lister, '5 Pearse Street');
    const email = `aoife.${crypto.randomUUID().slice(0, 8)}@example.ie`;
    for (let i = 0; i < 30; i++) {
      await asksToViewLimited(
        new Headers({ 'x-forwarded-for': `198.51.100.${i}` }),
        `email:${email}`,
      );
    }
    const values = { fullName: 'Aoife Byrne', email, occupants: '2', hasPets: 'no' };
    // A mistyped field is said at the field, and never counts.
    expect(
      await askToView(ref, { ...values, email: 'nope' }, null, new Date(), new Headers()),
    ).toMatchObject({ ok: false, errors: { email: expect.any(String) } });
    expect(
      await askToView(
        ref,
        values,
        null,
        new Date(),
        new Headers({ 'x-forwarded-for': '198.51.100.200' }),
      ),
    ).toEqual({ ok: false, limited: true });
    const placed = await withOrg(lister.organisationId, async (tx) => ({
      applications: await tx
        .select()
        .from(applications)
        .where(eq(applications.lettingId, lettingId)),
      waiting: await tx.select().from(waitingEnquiries).where(eq(waitingEnquiries.email, email)),
    }));
    expect(placed).toEqual({ applications: [], waiting: [] });
  });
});
