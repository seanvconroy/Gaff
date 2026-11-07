/**
 * Makes an existing Gaff account a member of Gaff's own staff (M105), who can work the check
 * queue at /staff/checks. They sign in once first, so the account exists.
 *
 *   pnpm staff:add someone@gaff.ie [reviewer|admin]
 */
import pg from 'pg';
import { poolConfig } from '../src/db/connection';

async function main(): Promise<void> {
  const [email, role = 'reviewer'] = process.argv.slice(2);
  if (!email || !['reviewer', 'admin'].includes(role)) {
    console.error('Usage: pnpm staff:add someone@gaff.ie [reviewer|admin]');
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const client = new pg.Client(poolConfig(url, process.env.DATABASE_CA_CERT));
  await client.connect();
  try {
    const { rowCount } = await client.query(
      `insert into staff_members (user_id, role)
       select id, $2 from users where email = lower($1)
       on conflict (user_id) do update set role = excluded.role`,
      [email, role],
    );
    console.log(
      rowCount
        ? `${email} is now Gaff staff (${role}).`
        : `No account for ${email}: sign in once first.`,
    );
  } finally {
    await client.end();
  }
}

void main();
