import { isCronRequest } from '@/app/api/cron/auth';
import { runDueJobs } from '@/jobs/run-due';

export const dynamic = 'force-dynamic';
// The runner takes no new job after 45 seconds and lets running ones finish, well inside this.
export const maxDuration = 300;

/**
 * ADR-0014: Supabase Cron calls this every minute (scripts/db/supabase-tick.sql) with
 * CRON_SECRET as a bearer token. It runs the jobs that are due: reminders, deadlines, sends and
 * retries. Counts only in the response: never personal data.
 */
export async function GET(request: Request): Promise<Response> {
  const allowed = isCronRequest(request);
  if (allowed !== true) return allowed;
  return Response.json(await runDueJobs({ budgetMs: 45_000 }));
}
