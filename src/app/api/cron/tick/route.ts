import { createHash, timingSafeEqual } from 'node:crypto';
import { runDueJobs } from '@/jobs/run-due';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';
// The runner takes no new job after 45 seconds and lets running ones finish, well inside this.
export const maxDuration = 300;

/** Compares secrets in constant time, whatever their lengths. */
function sameSecret(given: string, wanted: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(wanted));
}

/**
 * ADR-0014: Supabase Cron calls this every minute (scripts/db/supabase-tick.sql), and Vercel Cron
 * once a day as a backstop (vercel.json), each with CRON_SECRET as a bearer token. It runs the
 * jobs that are due (reminders, deadlines, sends and retries) and, once a day, the retention job.
 * Counts only in the response: never personal data.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = env().CRON_SECRET;
  if (!secret) return new Response('Not configured', { status: 404 });
  const given = request.headers.get('authorization') ?? '';
  if (!sameSecret(given, `Bearer ${secret}`)) {
    return new Response('Not allowed', { status: 401 });
  }
  const result = await runDueJobs({ budgetMs: 45_000 });
  return Response.json(result);
}
