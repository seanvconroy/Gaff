import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { E2E_DATABASE_URL } from '../../playwright.config';
import e2eSetup from '../e2e/global-setup';
import { aPng } from '../fixtures/photos';

/**
 * M136: the journeys' fresh database and worker, then made-up live homes, each with the point
 * its lister placed (M125), so Google's map has pins to show. The addresses are made up; each
 * point is on a public street, never a real person's home.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const teardown = await e2eSetup();
  try {
    await liveHomes();
  } catch (error) {
    await teardown();
    throw error;
  }
  return teardown;
}

/** Three homes in Ranelagh, two of them at one point, and one across the city. */
export const MAP_HOMES = [
  {
    address: '21 Ranelagh Road',
    area: 'Ranelagh, Dublin 6',
    rent: 2250,
    lat: 53.3263,
    lng: -6.2563,
  },
  {
    address: '4 Elmwood Avenue',
    area: 'Ranelagh, Dublin 6',
    rent: 1950,
    lat: 53.3238,
    lng: -6.2585,
  },
  {
    address: '6 Elmwood Avenue',
    area: 'Ranelagh, Dublin 6',
    rent: 2100,
    lat: 53.3238,
    lng: -6.2585,
  },
  {
    address: '9 Drumcondra Road',
    area: 'Drumcondra, Dublin 9',
    rent: 1800,
    lat: 53.3655,
    lng: -6.2585,
  },
] as const;

async function liveHomes(): Promise<void> {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.rls_bypass', 'on', true)");
    const userId = randomUUID();
    const {
      rows: [org],
    } = await client.query<{ id: string }>(
      `insert into organisations (name, kind, confirmed_at, psra_licence_number, inbound_slug)
       values ('Liffey Map Lettings', 'agency', now(), '7779136', $1) returning id`,
      [`liffey-${userId.slice(0, 8)}`],
    );
    await client.query('insert into users (id, name, email) values ($1, $2, $3)', [
      userId,
      'Map Test',
      `map.${userId.slice(0, 8)}@liffey.test`,
    ]);
    const photo = aPng([36, 99, 168]);
    for (const [i, home] of MAP_HOMES.entries()) {
      const {
        rows: [letting],
      } = await client.query<{ id: string }>(
        `insert into lettings (organisation_id, address_line1, area, county, monthly_rent_cents,
           available_from, property_type, bedrooms, furnished, parking, criteria, stage, status,
           created_by, lead_user_id, live_at, ber_rating, latitude, longitude, point_source,
           point_set_at)
         values ($1, $2, $3, 'Dublin', $4, current_date + 7, 'apartment', 2, 'furnished',
           'street', '{"noPets": true}', 'enquiries', 'live', $5, $5,
           now() - make_interval(hours => $6), 'C1', $7, $8, 'letter', now()) returning id`,
        [org!.id, home.address, home.area, home.rent * 100, userId, i + 1, home.lat, home.lng],
      );
      const key = `homes/${org!.id}/${randomUUID()}.png`;
      await client.query(
        'insert into dev_photo_store (key, content_type, bytes, size) values ($1, $2, $3, $4)',
        [key, 'image/png', photo, photo.length],
      );
      await client.query(
        `insert into letting_photos (organisation_id, letting_id, position, storage_key,
           content_type, bytes, created_by)
         values ($1, $2, 0, $3, 'image/png', $4, $5)`,
        [org!.id, letting!.id, key, photo.length, userId],
      );
    }
    await client.query('commit');
  } finally {
    await client.end();
  }
}
