import { isCronRequest } from '@/app/api/cron/auth';
import { queueDailyJobs, runDueJobs } from '@/jobs/run-due';

export const dynamic = 'force-dynamic';
// The runner takes no new job after 45 seconds and lets running ones finish, well inside this.
export const maxDuration = 300;

/**
 * ADR-0014: once a day (Vercel Cron at 02:30 UTC, and Supabase Cron as a second caller), queue
 * the daily jobs (the retention sweep, R26) and run everything due. Counts only in the response.
 */
export async function GET(request: Request): Promise<Response> {
  const allowed = isCronRequest(request);
  if (allowed !== true) return allowed;
  await queueDailyJobs();
  return Response.json(await runDueJobs({ budgetMs: 45_000 }));
}
