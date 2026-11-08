import { sql } from 'drizzle-orm';
import { after } from 'next/server';
import type { Tx } from '@/db/client';
import { env } from '@/lib/env';

/** Background tasks the worker knows (src/jobs/tasks.ts). */
export type TaskName =
  | 'process_inbound_email'
  | 'send_message'
  | 'draft_answers'
  | 'offer_place'
  | 'expire_offer'
  | 'reference_overdue'
  | 'expire_home_offer'
  | 'rtb_reminder'
  | 'process_media'
  | 'redact_identity'
  | 'close_enquiries'
  | 'listings_freshness'
  | 'alerts_match'
  | 'alerts_send'
  | 'alerts_daily'
  | 'check_listing_wording';

/**
 * Queues a job in the caller's transaction (ADR-0003): the job exists only if the change that
 * caused it commits, so nothing is lost and nothing is sent for a change that rolled back.
 */
export async function enqueue(
  tx: Tx,
  task: TaskName,
  payload: Record<string, unknown>,
  options: {
    runAt?: Date;
    jobKey?: string;
    maxAttempts?: number;
    /**
     * "preserve_run_at" keeps a queued job's time when it's queued again with the same key, so
     * later additions join it instead of pushing it back (M87: alerts grouped within 2 minutes).
     */
    jobKeyMode?: 'replace' | 'preserve_run_at';
  } = {},
): Promise<void> {
  await tx.execute(sql`
    select graphile_worker.add_job(
      ${task},
      ${JSON.stringify(payload)}::json,
      run_at => ${options.runAt?.toISOString() ?? null}::timestamptz,
      max_attempts => ${options.maxAttempts ?? 10}::int,
      job_key => ${options.jobKey ?? null}::text,
      job_key_mode => ${options.jobKeyMode ?? 'replace'}::text
    )`);
  const dueWithinAMinute = !options.runAt || options.runAt.getTime() - Date.now() < 60_000;
  if (dueWithinAMinute) runJobsAfterThisRequest();
}

/**
 * ADR-0014: on Vercel there's no long-running worker, so a request that queued a job runs the
 * due jobs once it has responded (by then its transaction has committed). The per-minute tick
 * catches anything else.
 */
function runJobsAfterThisRequest(): void {
  if (!env().RUN_JOBS_AFTER_REQUESTS) return;
  try {
    after(async () => {
      // Loaded here, not at the top: the task list imports the use cases that import this file.
      const { kickJobs } = await import('@/jobs/run-due');
      await kickJobs();
    });
  } catch {
    // Not in a request (a job queued by another job): the runner already going picks it up.
  }
}
