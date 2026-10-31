import { sql } from 'drizzle-orm';
import type { Tx } from '@/db/client';

/** Background tasks the worker knows (src/jobs/tasks.ts). */
export type TaskName =
  'process_inbound_email' | 'send_message' | 'draft_answers' | 'offer_place' | 'expire_offer';

/**
 * Queues a job in the caller's transaction (ADR-0003): the job exists only if the change that
 * caused it commits, so nothing is lost and nothing is sent for a change that rolled back.
 */
export async function enqueue(
  tx: Tx,
  task: TaskName,
  payload: Record<string, unknown>,
  options: { runAt?: Date; jobKey?: string; maxAttempts?: number } = {},
): Promise<void> {
  await tx.execute(sql`
    select graphile_worker.add_job(
      ${task},
      ${JSON.stringify(payload)}::json,
      run_at => ${options.runAt?.toISOString() ?? null}::timestamptz,
      max_attempts => ${options.maxAttempts ?? 10}::int,
      job_key => ${options.jobKey ?? null}::text
    )`);
}
