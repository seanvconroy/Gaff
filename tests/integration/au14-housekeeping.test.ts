import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withOrg } from '@/db/client';
import { accounts, invitations, memberships, sessions, users, verifications } from '@/db/schema';
import { countTry, triesSoFar } from '@/server/auth/limits';
import { createAccount } from '@/server/auth/flows';
import { acceptInvitation, inviteColleague } from '@/server/organisations/team';
import { sweepSignIn } from '@/server/retention/sign-in';
import { createTestMember } from './helpers';

const DAY = 24 * 60 * 60 * 1000;
const anEmail = () => `${crypto.randomUUID()}@housekeeping.test.gaff.ie`;
const from = () => new Headers({ 'x-forwarded-for': crypto.randomUUID() });
const GOOD = 'the bins go out on tuesday';

async function aPendingSignUp(daysAgo: number): Promise<{ id: string; email: string }> {
  const email = anEmail();
  const created = await createAccount({ email, password: GOOD }, from());
  if (!created.ok) throw new Error('sign-up refused');
  await db().execute(
    sql`update users set created_at = now() - make_interval(days => ${daysAgo}) where id = ${created.userId}`,
  );
  return { id: created.userId, email };
}

const exists = async (userId: string) =>
  (await db().select({ id: users.id }).from(users).where(eq(users.id, userId))).length === 1;

describe('AU14 (rule 9): sign-in’s leftovers are deleted by the nightly job', () => {
  it('deletes sessions that have ended, and keeps the ones still running', async () => {
    const id = crypto.randomUUID();
    await db().insert(users).values({ id, name: '', email: anEmail(), emailVerified: true });
    const session = (token: string, expiresAt: Date) => ({
      id: crypto.randomUUID(),
      userId: id,
      token,
      expiresAt,
    });
    const ended = session(`ended-${id}`, new Date(Date.now() - 60_000));
    const running = session(`running-${id}`, new Date(Date.now() + DAY));
    await db().insert(sessions).values([ended, running]);

    const swept = await sweepSignIn();
    expect(swept.sessions).toBeGreaterThanOrEqual(1);
    const left = await db()
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.userId, id));
    expect(left.map((row) => row.id)).toEqual([running.id]);
  });

  it('deletes codes and challenges that have run out, and keeps live ones', async () => {
    const old = { id: crypto.randomUUID(), identifier: `test-${crypto.randomUUID()}`, value: 'x' };
    const live = { id: crypto.randomUUID(), identifier: `test-${crypto.randomUUID()}`, value: 'x' };
    await db()
      .insert(verifications)
      .values([
        { ...old, expiresAt: new Date(Date.now() - 60_000) },
        { ...live, expiresAt: new Date(Date.now() + 600_000) },
      ]);

    const swept = await sweepSignIn();
    expect(swept.codes).toBeGreaterThanOrEqual(1);
    const gone = await db().select().from(verifications).where(eq(verifications.id, old.id));
    const kept = await db().select().from(verifications).where(eq(verifications.id, live.id));
    expect(gone).toEqual([]);
    expect(kept).toHaveLength(1);
  });

  it('deletes a sign-up nobody confirmed within 7 days, with its password', async () => {
    const stale = await aPendingSignUp(8);
    const recent = await aPendingSignUp(6);

    const swept = await sweepSignIn();
    expect(swept.pendingSignUps).toBeGreaterThanOrEqual(1);
    expect(await exists(stale.id)).toBe(false);
    expect(await db().select().from(accounts).where(eq(accounts.userId, stale.id))).toEqual([]);
    // Still inside the week: it can be confirmed yet.
    expect(await exists(recent.id)).toBe(true);
  });

  it('never deletes an account that is more than a sign-up, confirmed or not', async () => {
    // Confirmed long ago, and not used since: it stays until its owner deletes it.
    const confirmed = crypto.randomUUID();
    await db()
      .insert(users)
      .values({ id: confirmed, name: '', email: anEmail(), emailVerified: true });
    await db().execute(
      sql`update users set created_at = now() - make_interval(days => 400) where id = ${confirmed}`,
    );
    // Unconfirmed on paper, but on a team: a real account.
    const admin = await createTestMember({ kind: 'agency' });
    const onATeam = await aPendingSignUp(30);
    await db()
      .insert(memberships)
      .values({ organisationId: admin.organisationId, userId: onATeam.id, role: 'negotiator' });

    await sweepSignIn();
    expect(await exists(confirmed)).toBe(true);
    expect(await exists(onATeam.id)).toBe(true);
  });

  it('deletes invitations nobody accepted before they ran out, in every workspace', async () => {
    const admin = await createTestMember({ kind: 'agency' });
    const other = await createTestMember({ kind: 'agency' });
    const lapsed = await inviteColleague(admin, { email: anEmail(), role: 'negotiator' });
    const lapsedElsewhere = await inviteColleague(other, { email: anEmail(), role: 'admin' });
    const open = await inviteColleague(admin, { email: anEmail(), role: 'negotiator' });
    for (const [organisationId, id] of [
      [admin.organisationId, lapsed.invitationId],
      [other.organisationId, lapsedElsewhere.invitationId],
    ] as const) {
      await withOrg(organisationId, (tx) =>
        tx
          .update(invitations)
          .set({ expiresAt: new Date(Date.now() - 60_000) })
          .where(eq(invitations.id, id)),
      );
    }

    // One that was accepted keeps its row (who joined, and when), with no address on it.
    const joiner = { id: crypto.randomUUID(), email: anEmail(), emailVerified: true };
    await db()
      .insert(users)
      .values({ ...joiner, name: 'Colleague' });
    const accepted = await inviteColleague(other, { email: joiner.email, role: 'negotiator' });
    const [{ text }] = (
      await db().execute(
        sql`select text from dev_outbox where to_address = ${joiner.email} order by created_at desc limit 1`,
      )
    ).rows as [{ text: string }];
    const [, organisationId, token] = /\/join\/([^/]+)\/([A-Za-z0-9_-]+)/.exec(text)!;
    expect(await acceptInvitation(joiner, organisationId!, token!)).toEqual({ ok: true });
    await withOrg(other.organisationId, (tx) =>
      tx
        .update(invitations)
        .set({ expiresAt: new Date(Date.now() - 60_000) })
        .where(eq(invitations.id, accepted.invitationId)),
    );

    const swept = await sweepSignIn();
    expect(swept.invitations).toBeGreaterThanOrEqual(2);
    const mine = await withOrg(admin.organisationId, (tx) => tx.select().from(invitations));
    expect(mine.map((row) => row.id)).toEqual([open.invitationId]);
    const theirs = await withOrg(other.organisationId, (tx) => tx.select().from(invitations));
    expect(theirs).toMatchObject([{ id: accepted.invitationId, email: null }]);
  });

  it('deletes the limiter’s counters once they’re over a day old', async () => {
    const who = crypto.randomUUID();
    const yesterday = new Date(Date.now() - DAY - 60_000);
    await countTry('housekeeping-old', who, 60, yesterday);
    await countTry('housekeeping-new', who, 3600);

    const swept = await sweepSignIn();
    expect(swept.limits).toBeGreaterThanOrEqual(1);
    const [left] = (
      await db().execute(
        sql`select count(*)::int as n from auth_limits where window_started_at < now() - interval '1 day'`,
      )
    ).rows as [{ n: number }];
    expect(left.n).toBe(0);
    expect(await triesSoFar('housekeeping-new', who, 3600)).toBe(1);
  });
});
