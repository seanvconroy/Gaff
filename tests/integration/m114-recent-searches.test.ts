import { describe, expect, it } from 'vitest';
import { db, withSystem } from '@/db/client';
import { recentSearches, users } from '@/db/schema';
import { deleteRenterAccount, myData } from '@/server/renters/account';
import { startRenting } from '@/server/renters/profile';
import { recentSearchesOf, rememberSearch } from '@/server/search/recent';

async function aRenter(): Promise<string> {
  const userId = crypto.randomUUID();
  const email = `recent.${userId.slice(0, 8)}@example.ie`;
  await db().insert(users).values({ id: userId, name: 'Ciara Doyle', email, emailVerified: true });
  await startRenting(userId, 'Ciara');
  return userId;
}

const at = (minute: number) => new Date(Date.UTC(2026, 10, 8, 12, minute));

describe('M114: a signed-in renter’s recent searches, kept with their account', () => {
  it('keeps the last 5 places, newest first, with what each one is', async () => {
    const renter = await aRenter();
    const searched: Array<[string, string]> = [
      ['/to-rent/dublin/rathmines', 'Rathmines'],
      ['/to-rent/cork/kinsale', 'Kinsale'],
      ['/to-rent/near/highfield-road-rathgar-dublin-6', 'Highfield Road'],
      ['/to-rent/galway', 'Galway'],
      ['/to-rent/dublin/dublin-6', 'Dublin 6'],
      ['/to-rent/dublin/ranelagh', 'Ranelagh'],
    ];
    for (const [i, [path, name]] of searched.entries()) {
      await rememberSearch(renter, path, name, at(i));
    }
    // Searching Kinsale again brings it to the top, once.
    await rememberSearch(renter, '/to-rent/cork/kinsale', 'Kinsale', at(10));

    expect(await recentSearchesOf(renter)).toEqual([
      { name: 'Kinsale', description: 'Town in County Cork', path: '/to-rent/cork/kinsale' },
      { name: 'Ranelagh', description: 'Area in Dublin', path: '/to-rent/dublin/ranelagh' },
      { name: 'Dublin 6', description: 'Dublin postal district', path: '/to-rent/dublin/dublin-6' },
      { name: 'Galway', description: 'County', path: '/to-rent/galway' },
      {
        name: 'Highfield Road',
        description: 'Rathgar, Dublin 6',
        path: '/to-rent/near/highfield-road-rathgar-dublin-6',
      },
    ]);
  });

  it('is the renter’s own: others can’t see it, it leaves out places gone from the index, and it goes with the account', async () => {
    const renter = await aRenter();
    const other = await aRenter();
    await rememberSearch(renter, '/to-rent/dublin/rathmines', 'Rathmines', at(1));
    await rememberSearch(renter, '/to-rent/near/a-street-gone-from-the-index', 'Gone Road', at(2));
    expect((await recentSearchesOf(renter)).map((r) => r.name)).toEqual(['Rathmines']);
    expect(await recentSearchesOf(other)).toEqual([]);

    const data = await myData(renter);
    expect(data.recentSearches.map((r) => r.areaPath).sort()).toEqual([
      '/to-rent/dublin/rathmines',
      '/to-rent/near/a-street-gone-from-the-index',
    ]);

    expect(await deleteRenterAccount(renter)).toBe('deleted');
    const left = await withSystem((tx) => tx.select().from(recentSearches));
    expect(left.some((r) => r.userId === renter)).toBe(false);
  });
});
