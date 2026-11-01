import { describe, expect, it, vi } from 'vitest';

vi.mock('@/jobs/run-due', () => ({
  runDueJobs: vi.fn(async () => ({ succeeded: 0, failed: 0, stoppedBy: 'queue_empty' })),
}));

const secret = 'tick-secret-for-tests-only-0123456789';
process.env.CRON_SECRET = secret;

const tick = (authorization?: string) =>
  new Request('http://localhost/api/cron/tick', {
    headers: authorization ? { authorization } : {},
  });

describe('ADR-0014: the per-minute tick', () => {
  it('ADR-0014: runs due jobs only when called with the cron secret', async () => {
    const { GET } = await import('@/app/api/cron/tick/route');
    const { runDueJobs } = await import('@/jobs/run-due');

    expect((await GET(tick())).status).toBe(401);
    expect((await GET(tick('Bearer not-the-secret'))).status).toBe(401);
    expect((await GET(tick(secret))).status).toBe(401);
    expect(runDueJobs).not.toHaveBeenCalled();

    const response = await GET(tick(`Bearer ${secret}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ succeeded: 0, failed: 0, stoppedBy: 'queue_empty' });
    expect(runDueJobs).toHaveBeenCalledTimes(1);
  });
});
