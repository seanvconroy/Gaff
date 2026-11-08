/**
 * Seeds the test copy with made-up letters and homes (src/server/dev/seed.ts).
 *
 *   pnpm db:seed            seed this database now (never production)
 *   pnpm db:seed --deploy   the Vercel build: only the test copy's production deployment, and a
 *                           failure is logged without failing the deploy
 */
import { pool } from '@/db/client';
import { seedTestCopy, shouldSeed } from '@/server/dev/seed';

const deploy = process.argv.includes('--deploy');

async function main(): Promise<void> {
  if (deploy && !shouldSeed(process.env)) {
    console.log('Seed: skipped (only the test copy’s production deployment is seeded).');
    return;
  }
  try {
    const report = await seedTestCopy();
    // Counts only: no names, addresses or emails in build logs.
    console.log(`Seed: ${JSON.stringify(report)}`);
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
