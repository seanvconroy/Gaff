import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { places } from '../../src/db/schema';
import { fixturePlaces } from '../../src/domain/places/fixture';
import { rowFromPlace } from '../../src/server/places/places';

/**
 * ADR-0025: tests search the fixture (real Irish places, a few streets and landmarks), not the
 * whole place index, so they're quick and their answers don't change when the index does.
 */
export async function loadFixturePlaces(databaseUrl: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const db = drizzle(pool, { casing: 'snake_case' });
    await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.rls_bypass', 'on', true)`);
      await tx.delete(places);
      await tx.insert(places).values(fixturePlaces.map((p) => rowFromPlace(p, 1, 'fixture')));
    });
  } finally {
    await pool.end();
  }
}
