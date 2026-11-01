import { run } from 'graphile-worker';
import { pool } from '@/db/client';
import { CRONTAB, taskList } from './tasks';

/**
 * The long-running worker (ADR-0003): runs background jobs from the Postgres queue as they come
 * in. Started with `pnpm worker` locally and in end-to-end tests. On Vercel there's no
 * long-running process: the cron tick and requests use runDueJobs() instead (ADR-0014).
 */
async function main(): Promise<void> {
  const runner = await run({
    pgPool: pool(),
    taskList,
    concurrency: 5,
    noHandleSignals: false,
    pollInterval: 2000,
    crontab: CRONTAB,
  });
  console.log('Gaff worker started.');
  await runner.promise;
}

main().catch((error: unknown) => {
  console.error('Gaff worker stopped with an error', error);
  process.exit(1);
});
