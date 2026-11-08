import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withEnquiry, withOrg, withPublic, withRenter } from '@/db/client';
import { listings, publicListings, renterProfiles, users } from '@/db/schema';
import { createLetting } from '@/server/lettings/create-letting';
import { aLetting } from '../fixtures/lettings';
import { createTestMember, databaseError } from './helpers';

/** Every column a public table may have (ADR-0017). Adding one is a decision: no personal data. */
const PUBLIC_LISTING_COLUMNS = [
  'listing_id',
  'organisation_id',
  'slug',
  'status',
  'title',
  'address_shown',
  'area',
  'county',
  'routing_key',
  'latitude',
  'longitude',
  'rent_cents',
  'deposit_cents',
  'property_type',
  'bedrooms',
  'bathrooms',
  'furnished',
  'available_from',
  'ber_label',
  'ber_band',
  'pets_considered',
  'facts',
  'criteria',
  // M76: the codes of the fixed questions the enquiry sheet asks.
  'questions',
  'photos',
  'letter',
  'description',
  'tour_url',
  'development_id',
  'published_at',
  'confirmed_at',
  'enquiries_close_at',
  'completeness',
  // M47: viewing times only; never who booked them.
  'viewings',
  // M74: when the home was let or withdrawn.
  'closed_at',
  'updated_at',
];

/** M75: a published development's page. */
/** ADR-0027: the place index holds places only: never anything about a person. */
const PLACE_COLUMNS = [
  'id',
  'slug',
  'kind',
  'landmark_kind',
  'name',
  'irish_name',
  'aliases',
  'context',
  'county',
  'routing_key',
  'centre_lat',
  'centre_lng',
  'min_lat',
  'min_lng',
  'max_lat',
  'max_lng',
  'line',
  'radius_metres',
  'population',
  'live_homes',
  'has_page',
  'search_text',
  'source',
  'source_id',
  'version',
];

const PUBLIC_DEVELOPMENT_COLUMNS = [
  'development_id',
  'organisation_id',
  'slug',
  'name',
  'area',
  'county',
  'routing_key',
  'latitude',
  'longitude',
  'description',
  'amenities',
  'photos',
  'operator',
  'updated_at',
];

const PUBLIC_TABLES = {
  public_listings: PUBLIC_LISTING_COLUMNS,
  public_developments: PUBLIC_DEVELOPMENT_COLUMNS,
  places: PLACE_COLUMNS,
};

async function aRenter(): Promise<string> {
  const id = crypto.randomUUID();
  await db()
    .insert(users)
    .values({ id, name: 'Renter', email: `${id}@renter.test.gaff.ie`, emailVerified: true });
  return id;
}

async function aPublishedRow(organisationId: string, listingId: string) {
  return {
    listingId,
    organisationId,
    slug: `test-${listingId}`,
    status: 'live' as const,
    title: '2 bed apartment in Ranelagh, Dublin 6',
    addressShown: 'Ranelagh Road, Ranelagh, Dublin 6',
    area: 'Ranelagh, Dublin 6',
    county: 'Dublin',
    routingKey: 'D06',
    latitude: 53.3262,
    longitude: -6.2563,
    rentCents: 185_000,
    depositCents: 185_000,
    propertyType: 'apartment',
    bedrooms: 2,
    bathrooms: 1,
    furnished: 'furnished',
    availableFrom: '2026-12-01',
    berLabel: 'BER C1',
    berBand: 'C',
    petsConsidered: false,
    facts: {},
    criteria: [],
    photos: [],
    letter: { kind: 'agency' },
    publishedAt: new Date(),
    confirmedAt: new Date(),
  };
}

describe('ADR-0017: data zones', () => {
  it('every table with row-level security is forced and has a zone policy', async () => {
    const { rows } = await db().execute<{ table: string; forced: boolean; policies: string[] }>(sql`
      select c.relname as table, c.relforcerowsecurity as forced,
        coalesce(array_agg(p.policyname::text) filter (where p.policyname is not null), '{}'::text[]) as policies
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_policies p on p.tablename = c.relname and p.schemaname = n.nspname
      where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
      group by c.relname, c.relforcerowsecurity`);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.forced, `${row.table} must force row-level security`).toBe(true);
      // ADR-0027: reference data (the place index) is its own zone: read by anyone, written only
      // by system jobs.
      const zones = row.policies.filter((p) =>
        [
          'tenant_isolation',
          'renter_isolation',
          'platform_append',
          'staff_zone',
          'system_write',
        ].includes(p),
      );
      expect(zones, `${row.table} needs exactly one zone policy`).toHaveLength(1);
    }
  });

  it('public tables carry only allow-listed columns, and are readable by anyone', async () => {
    for (const [table, allowed] of Object.entries(PUBLIC_TABLES)) {
      const { rows } = await db().execute<{ column: string }>(sql`
        select column_name as column from information_schema.columns
        where table_schema = 'public' and table_name = ${table}`);
      expect(rows.map((r) => r.column).sort(), `${table} columns`).toEqual([...allowed].sort());
      const { rows: policies } = await db().execute<{ policyname: string }>(sql`
        select policyname from pg_policies where tablename = ${table}`);
      expect(policies.map((p) => p.policyname)).toContain('public_read');
    }
  });

  it('M8: a renter sees and writes only their own profile', async () => {
    const a = await aRenter();
    const b = await aRenter();
    await withRenter(a, (tx) =>
      tx.insert(renterProfiles).values({ userId: a, givenName: 'Aoife' }),
    );
    await withRenter(b, (tx) =>
      tx.insert(renterProfiles).values({ userId: b, givenName: 'Brian' }),
    );

    const seenByA = await withRenter(a, (tx) => tx.select().from(renterProfiles));
    expect(seenByA.map((p) => p.userId)).toEqual([a]);
    expect(await db().select().from(renterProfiles)).toEqual([]);
    expect(
      await databaseError(
        withRenter(a, (tx) =>
          tx.insert(renterProfiles).values({ userId: crypto.randomUUID(), givenName: 'Ciara' }),
        ),
      ),
    ).toMatch(/row-level security|foreign key/);
    const changed = await withRenter(a, (tx) =>
      tx
        .update(renterProfiles)
        .set({ givenName: 'Changed' })
        .where(eq(renterProfiles.userId, b))
        .returning(),
    );
    expect(changed).toEqual([]);
  });

  it('a renter sees no organisation data', async () => {
    const member = await createTestMember();
    await createLetting(member, aLetting());
    const renter = await aRenter();
    expect(await withRenter(renter, (tx) => tx.select().from(listings))).toEqual([]);
  });

  it('public rows: anyone reads them, only the owning organisation writes them', async () => {
    const a = await createTestMember();
    const b = await createTestMember();
    await createLetting(a, aLetting());
    const [listing] = await withOrg(a.organisationId, (tx) => tx.select().from(listings));
    const row = await aPublishedRow(a.organisationId, listing!.id);
    await withOrg(a.organisationId, (tx) => tx.insert(publicListings).values(row));

    const seen = await withPublic((tx) =>
      tx.select().from(publicListings).where(eq(publicListings.listingId, listing!.id)),
    );
    expect(seen).toHaveLength(1);

    const updatedByB = await withOrg(b.organisationId, (tx) =>
      tx
        .update(publicListings)
        .set({ title: 'Hijacked' })
        .where(eq(publicListings.listingId, listing!.id))
        .returning(),
    );
    expect(updatedByB).toEqual([]);
    expect(
      await databaseError(
        withOrg(b.organisationId, (tx) =>
          tx.insert(publicListings).values({ ...row, slug: `${row.slug}-b`, title: 'Fake' }),
        ),
      ),
    ).toMatch(/row-level security|duplicate key/);
  });

  it('public reads are read-only', async () => {
    const message = await databaseError(
      withPublic((tx) => tx.execute(sql`create temporary table nope (id int)`)),
    );
    expect(message).toMatch(/read-only transaction/);
  });

  it('withEnquiry sees the organisation and the renter together, and nothing else', async () => {
    const a = await createTestMember();
    const b = await createTestMember();
    await createLetting(a, aLetting());
    await createLetting(b, aLetting());
    const renter = await aRenter();
    const seen = await withEnquiry(a.organisationId, renter, async (tx) => {
      await tx.insert(renterProfiles).values({ userId: renter, givenName: 'Aoife' });
      return {
        listings: await tx.select().from(listings),
        profiles: await tx.select().from(renterProfiles),
      };
    });
    expect(seen.listings.every((l) => l.organisationId === a.organisationId)).toBe(true);
    expect(seen.listings).toHaveLength(1);
    expect(seen.profiles.map((p) => p.userId)).toEqual([renter]);
  });
});
