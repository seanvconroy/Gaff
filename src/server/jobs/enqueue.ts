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
  | 'send_account_email'
  /** UX-AV-6: an enquiry made on Gaff from a typed email: its first reply, and its 24 hours. */
  | 'send_waiting_reply'
  | 'drop_waiting_enquiry'
  | 'send_saved_search_email'
  | 'saved_search_alerts'
  /** M86, M87: alerts for searches that hear as soon as a home is listed, a couple of minutes on. */
  | 'instant_search_alerts'
  /** M49: the daily sweep that keeps live homes fresh. */
  | 'listing_freshness'
  /** P26: Stripe deletes the ID and selfie of a session whose check has gone with a profile. */
  | 'redact_identity_session';

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
     * With `jobKey`: `preserve_run_at` keeps a waiting job's time, so jobs queued one after
     * another run once, at the first one's time (graphile-worker's job key modes).
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
