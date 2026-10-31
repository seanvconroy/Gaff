import { run } from 'graphile-worker';
import { pool } from '@/db/client';
import { taskList } from './tasks';

/**
 * The worker process (ADR-0001, ADR-0003): runs background jobs from the Postgres queue.
 * Started with `pnpm worker`; on Render it's the gaff-worker service.
 */
async function main(): Promise<void> {
  const runner = await run({
    pgPool: pool(),
    taskList,
    concurrency: 5,
    noHandleSignals: false,
    pollInterval: 2000,
  });
  console.log('Gaff worker started.');
  await runner.promise;
}

main().catch((error: unknown) => {
  console.error('Gaff worker stopped with an error', error);
  process.exit(1);
});
