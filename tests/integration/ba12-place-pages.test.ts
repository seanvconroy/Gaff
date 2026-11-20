import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withOrg } from '@/db/client';
import { lettings } from '@/db/schema';
import sitemap from '@/app/sitemap';
import robots from '@/app/robots';
import { resetEnvForTests } from '@/lib/env';
import { publicHomePage } from '@/server/homes/public-homes';
import { closeLetting } from '@/server/lettings/close';
import { addPhoto } from '@/server/lettings/photos';
import { placePageFor, sitemapEntries } from '@/server/search/place-pages';
import { similarTo, similarToLiveHome } from '@/server/search/similar';
import { forgetHomeAddresses } from '@/server/search/where';
import { aPng } from '../fixtures/photos';
import { aLiveLetting, createTestMember, type Member } from './helpers';

/**
 * BA-12 (M62, M58, M73, M74, M111): places' pages, the sitemap and similar homes, read from the
 * one public query for homes on Gaff. The homes here are in Clifden, which only the place
 * index's own test also uses, so each count is at least what these add.
 */

async function aHomeIn(
  member: Member,
  overrides: Partial<Record<string, string>>,
): Promise<{ lettingId: string; ref: string }> {
  const { lettingId } = await aLiveLetting(member, {
    area: 'Clifden',
    county: 'Galway',
    eircode: '',
    ...overrides,
  });
  await addPhoto(member, lettingId, aPng([36, 99, 168]));
  const [row] = await withOrg(member.organisationId, (tx) =>
    tx.select({ ref: lettings.publicRef }).from(lettings).where(eq(lettings.id, lettingId)),
  );
  forgetHomeAddresses();
  return { lettingId, ref: row!.ref };
}

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvForTests();
});

function indexingOn() {
  vi.stubEnv('SEARCH_INDEXING', 'on');
  resetEnvForTests();
}

describe('M62: a place’s page, from its address', () => {
  it('M62: a place’s own address is its page, with its homes counted and the places around it', async () => {
    const member = await createTestMember();
    await aHomeIn(member, { addressLine1: '3 Market Street' });
    const page = await placePageFor(['galway', 'clifden'], {});
    expect(page.kind).toBe('page');
    if (page.kind !== 'page') return;
    expect(page.path).toBe('/to-rent/galway/clifden');
    expect(page.filters).toEqual({ where: 'clifden' });
    expect(page.placeName).toBe('Clifden, Co. Galway');
    expect(page.place.liveHomes).toBeGreaterThanOrEqual(1);
    expect(page.county).toMatchObject({ slug: 'galway', kind: 'county' });
    expect(page.wider).toEqual([]);
  });

  it('M62: other spellings go to the one address; filters go to the search at the first screen', async () => {
    expect(await placePageFor(['Clifden'], {})).toEqual({
      kind: 'redirect',
      path: '/to-rent/galway/clifden',
    });
    expect(await placePageFor(['galway', 'clifden'], { beds: '2', where: 'cork' })).toEqual({
      kind: 'redirect',
      path: '/?where=clifden&beds=2',
    });
    // Words Gaff doesn't read are left behind, and the page is the place's own.
    expect((await placePageFor(['galway', 'clifden'], { utm_source: 'x' })).kind).toBe('page');
    expect(await placePageFor(['galway', 'nowhere-at-all'], {})).toEqual({ kind: 'not_found' });
  });

  it('M62: a place with no homes still has its page, offering wider places with homes', async () => {
    const member = await createTestMember();
    await aHomeIn(member, { addressLine1: '5 Market Street' });
    const page = await placePageFor(['leitrim'], {});
    expect(page.kind).toBe('page');
    if (page.kind !== 'page') return;
    expect(page.place.liveHomes).toBe(0);
    expect(page.wider.length).toBeGreaterThan(0);
    for (const place of page.wider) expect(place.liveHomes).toBeGreaterThan(0);
  });
});

describe('M111: what search engines are told', () => {
  it('M111: with SEARCH_INDEXING off there is no sitemap entry, and robots.txt names none', async () => {
    const member = await createTestMember();
    await aHomeIn(member, { addressLine1: '7 Market Street' });
    vi.stubEnv('SEARCH_INDEXING', 'off');
    resetEnvForTests();
    expect(await sitemap()).toEqual([]);
    expect(robots()).toEqual({ rules: { userAgent: '*', disallow: '/' } });
  });

  it('M111: with it on, only live homes and the pages of places with homes are listed', async () => {
    const member = await createTestMember();
    const live = await aHomeIn(member, { addressLine1: '9 Market Street' });
    const gone = await aHomeIn(member, { addressLine1: '11 Market Street' });
    await closeLetting(member, gone.lettingId, 'let');
    forgetHomeAddresses();
    indexingOn();
    const urls = (await sitemap()).map((entry) => entry.url);
    const base = process.env.APP_URL!.replace(/\/+$/, '');
    expect(urls).toContain(`${base}/homes/${live.ref}`);
    expect(urls).not.toContain(`${base}/homes/${gone.ref}`);
    expect(urls).toContain(`${base}/to-rent/galway/clifden`);
    expect(urls).toContain(`${base}/to-rent/galway`);
    // A place with no homes, the first screen and every private page stay out.
    expect(urls).not.toContain(`${base}/to-rent/leitrim`);
    expect(urls).not.toContain(`${base}/`);
    for (const url of urls) {
      expect(url).toMatch(
        new RegExp(`^${base}/(homes/[0-9a-f]{12}|to-rent/[a-z0-9-]+(/[a-z0-9-]+)?)$`),
      );
    }
    // Q51: nothing in an address gives a home's street.
    expect(urls.join('\n')).not.toMatch(/market-street/i);
    expect(robots()).toMatchObject({ sitemap: `${base}/sitemap.xml` });
  });

  it('M111: the sitemap’s entries are the same homes as the public query’s', async () => {
    const entries = await sitemapEntries();
    for (const entry of entries.filter((e) => e.path.startsWith('/homes/'))) {
      const page = await publicHomePage(entry.path.slice('/homes/'.length));
      expect(page?.state, entry.path).toBe('live');
    }
  });
});

describe('M73, M74: similar homes', () => {
  it('M73: a live home’s page offers live homes like it nearby, never itself', async () => {
    const member = await createTestMember();
    const home = await aHomeIn(member, { addressLine1: '13 Market Street' });
    const like = await aHomeIn(member, { addressLine1: '15 Market Street' });
    const house = await aHomeIn(member, {
      addressLine1: '17 Market Street',
      propertyType: 'house',
    });
    const found = await similarToLiveHome(home.ref);
    const refs = found.homes.map((h) => h.id);
    expect(refs).toContain(like.ref);
    expect(refs).not.toContain(home.ref);
    expect(refs).not.toContain(house.ref);
    expect(refs.length).toBeLessThanOrEqual(3);
    expect(found.place).toMatchObject({ slug: 'clifden' });
  });

  it('M74, UX-LS-10: a let home’s page offers similar live homes, and its place', async () => {
    const member = await createTestMember();
    const home = await aHomeIn(member, { addressLine1: '19 Market Street' });
    const like = await aHomeIn(member, { addressLine1: '21 Market Street' });
    await closeLetting(member, home.lettingId, 'let');
    forgetHomeAddresses();
    const page = await publicHomePage(home.ref);
    expect(page?.state).toBe('let');
    if (page?.state !== 'let') return;
    const found = await similarTo(page.facts);
    expect(found.homes.map((h) => h.id)).toContain(like.ref);
    expect(found.homes.map((h) => h.id)).not.toContain(home.ref);
    expect(found.place).toMatchObject({ slug: 'clifden' });
  });
});
