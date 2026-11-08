/**
 * ADR-0027: tests a built place index before it's committed.
 *
 *   pnpm places:check                  check data/places/places.ndjson.gz
 *   pnpm places:check --file <file>    check another file
 *
 * It checks the file as a whole (quality.ts), then loads it into a scratch database and searches
 * it the way the Where box does, for each place in scripts/places/test-set.csv. The scratch
 * database is PLACES_CHECK_DATABASE_URL (by default gaff_places_check on the local Postgres, as
 * the gaff role); it's created, and dropped afterwards. It never touches DATABASE_URL.
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { runMigrations } from '@/db/migrate';
import { checkExpectation, checkPlaces, readTestSet, type Shown } from './quality';

const TEST_SET = 'scripts/places/test-set.csv';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function onAdmin(url: string, statement: string): Promise<void> {
  const admin = new pg.Client({
    connectionString: Object.assign(new URL(url), { pathname: '/postgres' }).toString(),
  });
  await admin.connect();
  try {
    await admin.query(statement);
  } finally {
    await admin.end();
  }
}

async function main(): Promise<number> {
  const url =
    process.env.PLACES_CHECK_DATABASE_URL ??
    'postgres://gaff:gaff@localhost:5432/gaff_places_check';
  const name = new URL(url).pathname.slice(1);
  // The app's code reads its settings on first use: point it at the scratch database only.
  process.env.DATABASE_URL = url;
  process.env.APP_URL = 'http://localhost:3000';
  process.env.AUTH_SECRET = 'places-check-only-never-a-real-secret';
  process.env.GAFF_ENV = 'test';
  const { PLACE_FILE, readPlaceFile, replacePlaces } = await import('@/server/places/load');
  const { suggestPlaces } = await import('@/server/places/places');
  const { pool } = await import('@/db/client');

  const file = arg('--file') ?? PLACE_FILE;
  console.log(`Checking ${file}`);
  const { header, rows } = await readPlaceFile(file);
  const problems = checkPlaces(
    header,
    rows.map((r) => r.place),
  );
  const expectations = readTestSet(readFileSync(TEST_SET, 'utf8'));

  await onAdmin(url, `drop database if exists "${name}" with (force)`);
  await onAdmin(url, `create database "${name}"`);
  try {
    await runMigrations(url);
    await replacePlaces(rows, header.version);
    for (const expected of expectations) {
      const found = await suggestPlaces(expected.query);
      const shown: Shown[] = found.groups.flatMap((g) =>
        g.items.map((s) => ({ name: s.name, context: s.context, county: s.place?.county ?? null })),
      );
      const problem = checkExpectation(expected, shown);
      if (problem) problems.push(problem);
    }
  } finally {
    await pool().end();
    await onAdmin(url, `drop database if exists "${name}" with (force)`);
  }

  const byKind = new Map<string, number>();
  for (const { place } of rows) byKind.set(place.kind, (byKind.get(place.kind) ?? 0) + 1);
  console.log(`Version ${header.version}, built ${header.built}: ${rows.length} places.`);
  console.log(Object.fromEntries([...byKind].sort()));
  console.log(`Searched ${expectations.length} places renters must find.`);
  if (problems.length) {
    console.error(`\n${problems.length} problem${problems.length === 1 ? '' : 's'}:`);
    for (const problem of problems) console.error(`- ${problem}`);
    return 1;
  }
  console.log('The place index passes.');
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
