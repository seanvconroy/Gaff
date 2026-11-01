import { consoleLogFactory, Logger, parseCrontab, run, type TaskList } from 'graphile-worker';
import { pool } from '@/db/client';
import { CRONTAB, taskList } from './tasks';

const CONCURRENCY = 3;

// A run starts every minute, so only warnings and errors are logged, plus one line per run that
// did something (counts only, never personal data).
const quietLogger = new Logger((scope) => {
  const log = consoleLogFactory(scope);
  return (level, message, meta) => {
    if (level === 'error' || level === 'warning') log(level, message, meta);
  };
});

export interface DueJobsResult {
  succeeded: number;
  failed: number;
  stoppedBy: 'queue_empty' | 'time_budget';
}

/**
 * ADR-0014: runs the jobs that are due, then stops. Vercel has no always-on worker, so the
 * per-minute cron tick and requests that queue work call this instead of `pnpm worker`.
 *
 * It stops once nothing is running and nothing is due, or when the time budget is used up.
 * Either way it stops cleanly, letting running jobs finish: a job cut off mid-way would stay
 * locked for 4 hours before graphile-worker retried it. Keep the budget well inside the
 * function's time limit.
 */
export async function runDueJobs(
  options: {
    budgetMs?: number;
    withSchedule?: boolean;
    /** Tests only: a job is picked up only if its task is in this list. */
    tasks?: TaskList;
  } = {},
): Promise<DueJobsResult> {
  const budgetMs = options.budgetMs ?? 45_000;
  const withSchedule = options.withSchedule ?? true;
  let succeeded = 0;
  let failed = 0;
  // Set by stop(), from an event handler, so TypeScript mustn't narrow it to its first value.
  let stoppedBy = 'queue_empty' as DueJobsResult['stoppedBy'];
  // With the schedule on, wait until missed scheduled jobs (the nightly retention job) are queued.
  let scheduleChecked = !withSchedule;
  // Workers that last found nothing to do. When every worker is idle, the run is over.
  const idle = new Set<unknown>();

  const runner = await run({
    pgPool: pool(),
    taskList: options.tasks ?? taskList,
    concurrency: CONCURRENCY,
    noHandleSignals: true,
    pollInterval: 1000,
    logger: quietLogger,
    // The daily schedule, filled in if its time passed since the last run ("?fill=2d").
    parsedCronItems: withSchedule ? parseCrontab(CRONTAB) : [],
    // Batching with no delay means stopping waits until every finished job is marked done, so a
    // response never goes out while a completion is still on its way to the database.
    preset: { worker: { completeJobBatchDelay: 0, failJobBatchDelay: 0 } },
  });

  let stopping = false;
  const stop = (reason: DueJobsResult['stoppedBy']) => {
    if (stopping) return;
    stopping = true;
    stoppedBy = reason;
    runner.stop(reason).catch((error: unknown) => console.error('Jobs: could not stop', error));
  };

  runner.events.on('cron:started', () => {
    scheduleChecked = true;
  });
  // A worker looking for a job isn't idle, even if it found nothing last time.
  runner.events.on('worker:getJob:start', ({ worker }) => {
    idle.delete(worker);
  });
  runner.events.on('job:complete', ({ error }) => {
    if (error) failed += 1;
    else succeeded += 1;
  });
  runner.events.on('worker:getJob:empty', ({ worker }) => {
    idle.add(worker);
    if (scheduleChecked && idle.size >= CONCURRENCY) stop('queue_empty');
  });
  const timer = setTimeout(() => stop('time_budget'), budgetMs);

  try {
    await runner.promise;
  } finally {
    clearTimeout(timer);
  }
  if (succeeded + failed > 0 || stoppedBy === 'time_budget') {
    console.log(`Jobs: ${succeeded} done, ${failed} failed, stopped by ${stoppedBy}.`);
  }
  return { succeeded, failed, stoppedBy };
}

/**
 * Runs due jobs straight after a request that queued some, so a reply goes out in seconds rather
 * than at the next tick. One run at a time per server instance; a kick that arrives while a run
 * is going asks for one more pass, so a job queued just as a run stops isn't left for the tick.
 */
let active: Promise<void> | null = null;
let again = false;

export function kickJobs(): Promise<void> {
  if (active) {
    again = true;
    return active;
  }
  active = (async () => {
    do {
      again = false;
      await runDueJobs({ budgetMs: 20_000, withSchedule: false });
    } while (again);
  })()
    .catch((error: unknown) => console.error('Jobs: a run after a request failed', error))
    .finally(() => {
      active = null;
    });
  return active;
}
