import { EventEmitter } from 'node:events';
import { sql } from 'drizzle-orm';
import {
  consoleLogFactory,
  Logger,
  runOnce,
  type TaskList,
  type WorkerEvents,
  type WorkerPool,
} from 'graphile-worker';
import { db, pool } from '@/db/client';
import { taskList } from './tasks';
import { nextDailySend } from '@/domain/alerts/alerts';

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
 * A job whose run was cut off (a function stopped mid-job) stays locked. After 4 hours it's
 * released to run again, as graphile-worker's own long-running worker would do.
 */
async function releaseStaleLocks(): Promise<void> {
  await db().execute(sql`
    with jobs as (
      update graphile_worker._private_jobs
      set locked_at = null, locked_by = null, run_at = greatest(run_at, now())
      where locked_at < now() - interval '4 hours'
    )
    update graphile_worker._private_job_queues
    set locked_at = null, locked_by = null
    where locked_at < now() - interval '4 hours'`);
}

/**
 * ADR-0014: runs the jobs that are due, then stops. Vercel has no always-on worker, so the minute
 * tick and requests that queue work call this instead of `pnpm worker`.
 *
 * Each worker keeps taking due jobs until none is left (a job queued by a running job is taken
 * too), so the run ends when the queue is empty. If the time budget runs out first, it stops
 * taking jobs and lets running ones finish: a job cut off mid-way would stay locked for 4 hours.
 * Keep the budget well inside the function's time limit.
 *
 * It needs no long-lived connection and no prepared statements, so it works through Supabase's
 * transaction pooler, where LISTEN and session state aren't available.
 */
export async function runDueJobs(
  options: {
    budgetMs?: number;
    /** Tests only: a job is picked up only if its task is in this list. */
    tasks?: TaskList;
  } = {},
): Promise<DueJobsResult> {
  const budgetMs = options.budgetMs ?? 45_000;
  await releaseStaleLocks();

  let succeeded = 0;
  let failed = 0;
  // Set by the timer, so TypeScript mustn't narrow it to its first value.
  let stoppedBy = 'queue_empty' as DueJobsResult['stoppedBy'];
  let workers: WorkerPool | undefined;
  const events = new EventEmitter() as unknown as WorkerEvents;
  events.on('pool:create', ({ workerPool }) => {
    workers = workerPool;
  });
  events.on('job:complete', ({ error }) => {
    if (error) failed += 1;
    else succeeded += 1;
  });
  const timer = setTimeout(() => {
    stoppedBy = 'time_budget';
    Promise.resolve(workers?.gracefulShutdown('time budget used')).catch((error: unknown) =>
      console.error('Jobs: could not stop', error),
    );
  }, budgetMs);

  try {
    await runOnce({
      pgPool: pool(),
      taskList: options.tasks ?? taskList,
      concurrency: CONCURRENCY,
      noHandleSignals: true,
      logger: quietLogger,
      events,
      preset: {
        worker: {
          preparedStatements: false,
          // Batching with no delay means stopping waits until every finished job is marked
          // done, so a response never goes out while a completion is still on its way.
          completeJobBatchDelay: 0,
          failJobBatchDelay: 0,
        },
      },
    });
  } finally {
    clearTimeout(timer);
  }
  if (succeeded + failed > 0 || stoppedBy === 'time_budget') {
    console.log(`Jobs: ${succeeded} done, ${failed} failed, stopped by ${stoppedBy}.`);
  }
  return { succeeded, failed, stoppedBy };
}

/**
 * R26 (ADR-0005): once a day, queue the retention job. The job key keeps it to one queued at a
 * time, so the two daily callers (Vercel Cron and Supabase Cron) never pile up sweeps.
 */
export async function queueDailyJobs(): Promise<void> {
  await db().execute(sql`
    select graphile_worker.add_job('retention_sweep', '{}'::json, job_key => 'retention_sweep')`);
  // M49: listings not confirmed for 14 days get a reminder, and are paused 3 days later.
  await db().execute(sql`
    select graphile_worker.add_job('listings_freshness', '{}'::json, job_key => 'listings_freshness')`);
  // M86: the daily alert emails, at the next 8am in Ireland.
  await db().execute(sql`
    select graphile_worker.add_job('alerts_daily', '{}'::json,
      run_at => ${nextDailySend(new Date()).toISOString()}::timestamptz, job_key => 'alerts_daily')`);
  // M121: the counts of homes beside places, in case a change was missed.
  await db().execute(sql`
    select graphile_worker.add_job('places_count', '{}'::json, job_key => 'places_count')`);
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
      await runDueJobs({ budgetMs: 20_000 });
    } while (again);
  })()
    .catch((error: unknown) => console.error('Jobs: a run after a request failed', error))
    .finally(() => {
      active = null;
    });
  return active;
}
