/**
 * BA-4: seeds the test copy with made-up agencies, a private landlord and their homes
 * (src/server/dev/seed.ts).
 *
 *   pnpm db:seed            seed this database now (never production)
 *   pnpm db:seed --deploy   the Vercel build: only the test copy's production deployment
 *                           (GAFF_ENV=staging), never production or a preview; a failure is
 *                           logged without failing the deploy
 */
import { pool } from '@/db/client';
import { seedTestCopy, shouldSeed } from '@/server/dev/seed';

const deploy = process.argv.includes('--deploy');

async function main(): Promise<void> {
  if (deploy && !shouldSeed(process.env)) {
    console.log('Seed: skipped (only the test copy’s production deployment is seeded).');
    return;
  }
  const started = Date.now();
  try {
    const report = await seedTestCopy();
    // Counts only: no names, addresses or emails in build logs.
    console.log(`Seed: ${JSON.stringify(report)} in ${Date.now() - started} ms`);
  } catch (error) {
    console.error(
      `Seed failed: ${error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error'}`,
    );
    if (!deploy) process.exitCode = 1;
  } finally {
    await pool().end();
  }
}

void main();
