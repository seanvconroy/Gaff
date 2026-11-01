import { describe, expect, it, vi } from 'vitest';

vi.mock('@/jobs/run-due', () => ({
  runDueJobs: vi.fn(async () => ({ succeeded: 0, failed: 0, stoppedBy: 'queue_empty' })),
  queueDailyJobs: vi.fn(async () => undefined),
}));

const secret = 'tick-secret-for-tests-only-0123456789';
process.env.CRON_SECRET = secret;

const call = (path: string, authorization?: string) =>
  new Request(`http://localhost${path}`, { headers: authorization ? { authorization } : {} });

describe('ADR-0014: the schedulers run jobs', () => {
  it('ADR-0014: the minute tick runs due jobs only when called with the cron secret', async () => {
    const { GET } = await import('@/app/api/cron/tick/route');
    const { runDueJobs } = await import('@/jobs/run-due');

    expect((await GET(call('/api/cron/tick'))).status).toBe(401);
    expect((await GET(call('/api/cron/tick', 'Bearer not-the-secret'))).status).toBe(401);
    expect((await GET(call('/api/cron/tick', secret))).status).toBe(401);
    expect(runDueJobs).not.toHaveBeenCalled();

    const response = await GET(call('/api/cron/tick', `Bearer ${secret}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ succeeded: 0, failed: 0, stoppedBy: 'queue_empty' });
    expect(runDueJobs).toHaveBeenCalledTimes(1);
  });

  it('R26: the daily call queues the retention sweep, then runs due jobs', async () => {
    const { GET } = await import('@/app/api/cron/daily/route');
    const { queueDailyJobs, runDueJobs } = await import('@/jobs/run-due');
    vi.mocked(runDueJobs).mockClear();

    expect((await GET(call('/api/cron/daily'))).status).toBe(401);
    expect(queueDailyJobs).not.toHaveBeenCalled();

    expect((await GET(call('/api/cron/daily', `Bearer ${secret}`))).status).toBe(200);
    expect(queueDailyJobs).toHaveBeenCalledTimes(1);
    expect(runDueJobs).toHaveBeenCalledTimes(1);
  });
});
