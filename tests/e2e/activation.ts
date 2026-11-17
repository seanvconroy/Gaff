import pg from 'pg';
import { E2E_DATABASE_URL } from '../../playwright.config';

/**
 * Test-only set-up for the activation journeys (work package WP-27): what another journey
 * already covers through the screens, or would take a whole journey to reach. Made up.
 */
async function asSystem<T extends pg.QueryResultRow>(sql: string, params: unknown[]): Promise<T[]> {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.rls_bypass', 'on', true)");
    const { rows } = await client.query<T>(sql, params);
    await client.query('commit');
    return rows;
  } finally {
    await client.end();
  }
}

/**
 * Mail has come through the person's forwarding rule: what the test coming back sets
 * (UX-LT-19). The forwarding journeys do it through a real mailbox's steps.
 */
export async function forwardingNowWorks(email: string): Promise<void> {
  await asSystem(
    `update organisations set forwarding_works_at = now()
     where id in (select m.organisation_id from memberships m join users u on u.id = m.user_id
                  where u.email = $1)`,
    [email],
  );
}

/**
 * The person finished their setup checklist some time ago, as the record keeps it: the step for
 * their team was answered then, so nothing about inviting is waiting on them now.
 */
export async function setupFinishedLongAgo(email: string): Promise<void> {
  await asSystem(
    `insert into events (organisation_id, actor_type, actor_id, type, data, occurred_at)
     select m.organisation_id, 'person', u.id, 'setup.finished', '{"steps":2}'::jsonb,
            now() - interval '30 days'
     from memberships m join users u on u.id = m.user_id where u.email = $1`,
    [email],
  );
}
