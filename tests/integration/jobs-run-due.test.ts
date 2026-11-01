import { sql } from 'drizzle-orm';
import type { Task } from 'graphile-worker';
import { describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { runDueJobs } from '@/jobs/run-due';

// Each test uses its own task name: the runner only picks up jobs for tasks it knows, so these
// tests never run, or race with, jobs that other test files have queued.
const taskName = (label: string) => `test_${label}_${crypto.randomUUID().slice(0, 8)}`;

async function queue(task: string, payload: Record<string, unknown>, runAt?: Date) {
  await db().execute(sql`
    select graphile_worker.add_job(
      ${task},
      ${JSON.stringify(payload)}::json,
      run_at => ${runAt?.toISOString() ?? null}::timestamptz,
      max_attempts => 3
    )`);
}

async function waiting(task: string): Promise<Array<{ attempts: number; due: boolean }>> {
  const { rows } = await db().execute<{ attempts: number; due: boolean }>(sql`
    select j.attempts, j.run_at <= now() as due from graphile_worker._private_jobs j
    join graphile_worker._private_tasks t on t.id = j.task_id
    where t.identifier = ${task}`);
  return rows;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('ADR-0014: running due jobs without a long-running worker', () => {
  it('ADR-0014: runs every job that is due, leaves later ones, and stops when none are left', async () => {
    const task = taskName('due');
    const ran: number[] = [];
    await queue(task, { n: 1 });
    await queue(task, { n: 2 });
    await queue(task, { n: 3 }, new Date(Date.now() + 60 * 60_000));

    const run: Task = async (payload) => {
      ran.push((payload as { n: number }).n);
    };
    const result = await runDueJobs({ withSchedule: false, tasks: { [task]: run } });

    expect(ran.sort()).toEqual([1, 2]);
    expect(result).toEqual({ succeeded: 2, failed: 0, stoppedBy: 'queue_empty' });
    expect(await waiting(task)).toEqual([{ attempts: 0, due: false }]);
  });

  it('ADR-0014: runs a job that another job queued before it stops (a reply after reading an enquiry)', async () => {
    const first = taskName('first');
    const second = taskName('second');
    const ran: string[] = [];
    await queue(first, {});

    const result = await runDueJobs({
      withSchedule: false,
      tasks: {
        [first]: async (_payload, helpers) => {
          ran.push('first');
          await helpers.addJob(second, {});
        },
        [second]: async () => {
          ran.push('second');
        },
      },
    });

    expect(ran).toEqual(['first', 'second']);
    expect(result.succeeded).toBe(2);
  });

  it('ADR-0014: stops taking jobs when its time is up, but lets running jobs finish', async () => {
    const task = taskName('slow');
    for (let n = 1; n <= 5; n++) await queue(task, { n });

    const result = await runDueJobs({
      withSchedule: false,
      budgetMs: 300,
      tasks: {
        [task]: async () => {
          await sleep(1000);
        },
      },
    });

    // Three run at once; none is cut off; the other two wait for the next run.
    expect(result).toEqual({ succeeded: 3, failed: 0, stoppedBy: 'time_budget' });
    expect(await waiting(task)).toHaveLength(2);
    await runDueJobs({ withSchedule: false, tasks: { [task]: async () => {} } });
    expect(await waiting(task)).toHaveLength(0);
  });

  it('ADR-0014: keeps a job that failed, to retry it later, rather than losing it', async () => {
    const task = taskName('fails');
    await queue(task, {});

    const result = await runDueJobs({
      withSchedule: false,
      tasks: {
        [task]: async () => {
          throw new Error('the provider is down');
        },
      },
    });

    expect(result).toEqual({ succeeded: 0, failed: 1, stoppedBy: 'queue_empty' });
    expect(await waiting(task)).toEqual([{ attempts: 1, due: false }]);
  });
});
