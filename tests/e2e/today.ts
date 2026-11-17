import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { E2E_DATABASE_URL } from '../../playwright.config';

/**
 * Test-only set-up for the Today and Lettings journeys (work package WP-7): things the web app
 * has no way to do yet, or would take a whole journey to reach. Everything here is made up.
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
 * The person was last active in Gaff this many hours ago (UX-HM-8): one of their own active
 * minutes, as the page records them while someone is using it.
 */
export async function lastActive(email: string, hoursAgo: number): Promise<void> {
  await asSystem(
    `insert into activity_minutes (organisation_id, user_id, minute)
     select m.organisation_id, u.id, date_trunc('minute', now() - make_interval(hours => $2::int))
     from users u join memberships m on m.user_id = u.id where u.email = $1
     on conflict do nothing`,
    [email, hoursAgo],
  );
}

/**
 * A colleague joins this person's organisation, as the invitations of work package WP-19 will
 * have them do. Returns the colleague's email address, which they can sign in with.
 */
export async function aColleagueOf(
  email: string,
  name: string,
  role: 'admin' | 'negotiator' = 'negotiator',
): Promise<string> {
  const id = randomUUID();
  const colleague = `${name.toLowerCase().replace(/[^a-z]+/g, '.')}.${id.slice(0, 8)}@halcyon.test`;
  await asSystem(
    `with person as (
       insert into users (id, name, email, email_verified) values ($1, $2, $3, true) returning id
     )
     insert into memberships (organisation_id, user_id, role)
     select m.organisation_id, person.id, $5::member_role
     from person, users u join memberships m on m.user_id = u.id where u.email = $4`,
    [id, name, colleague, email, role],
  );
  return colleague;
}

/**
 * A home in this person's organisation, which they lead (UX-AG-9: the lead is whoever added it).
 * `draft` is still being set up; `let` and `withdrawn` were closed `closedDaysAgo` days ago.
 */
export async function aHomeLedBy(
  email: string,
  home: {
    address: string;
    status: 'draft' | 'live' | 'let' | 'withdrawn';
    stage?: string;
    addedDaysAgo?: number;
    closedDaysAgo?: number;
  },
): Promise<string> {
  const closed = home.status === 'let' || home.status === 'withdrawn';
  const stage = home.stage ?? (home.status === 'draft' ? 'setup' : closed ? 'close' : 'enquiries');
  const rows = await asSystem<{ id: string }>(
    `insert into lettings (organisation_id, address_line1, area, county, monthly_rent_cents,
       available_from, property_type, bedrooms, bathrooms, furnished, ber_rating, stage, status,
       created_by, lead_user_id, created_at, live_at, closed_at)
     select m.organisation_id, $2, 'Ranelagh, Dublin 6', 'Dublin', 185000,
       (now() + interval '30 days')::date, 'apartment', 2, 1, 'furnished', 'C1',
       $3::letting_stage, ($4::text)::letting_status, u.id, u.id,
       now() - make_interval(days => $5::int),
       case when $4::text = 'draft' then null else now() - make_interval(days => $5::int) end,
       case when $6::int is null then null else now() - make_interval(days => $6::int) end
     from users u join memberships m on m.user_id = u.id where u.email = $1
     returning id`,
    [
      email,
      home.address,
      stage,
      home.status,
      home.addedDaysAgo ?? 0,
      closed ? (home.closedDaysAgo ?? 0) : null,
    ],
  );
  if (!rows[0]) throw new Error(`${email} has no organisation to add ${home.address} to`);
  return rows[0].id;
}

/** The home at this address is let and closed, as it is once its tenancy is finished (R26). */
export async function letAndClosed(address: string, email: string): Promise<void> {
  await asSystem(
    `update lettings set status = 'let', stage = 'close', closed_at = now()
     where address_line1 = $1 and organisation_id in (
       select m.organisation_id from memberships m join users u on u.id = m.user_id
       where u.email = $2)`,
    [address, email],
  );
}

/** Every viewing time of the home at this address was yesterday: it has none still to come. */
export async function viewingsWereYesterday(address: string, email: string): Promise<void> {
  for (const table of ['viewing_slots', 'viewing_sessions']) {
    await asSystem(
      `update ${table} set starts_at = starts_at - (date_trunc('day', starts_at) - date_trunc('day', now() - interval '1 day')),
              ends_at = ends_at - (date_trunc('day', starts_at) - date_trunc('day', now() - interval '1 day'))
       where letting_id in (
         select l.id from lettings l join memberships m on m.organisation_id = l.organisation_id
         join users u on u.id = m.user_id where l.address_line1 = $1 and u.email = $2)`,
      [address, email],
    );
  }
}
