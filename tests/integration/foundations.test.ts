import { asc, and, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withOrg, withSystem } from '@/db/client';
import { decisions, events, memberships, organisations } from '@/db/schema';
import { recordDecision } from '@/server/decisions/record-decision';
import { recordEvent } from '@/server/record/events';
import { createTestMember, databaseError } from './helpers';

// Identity tables are read before an organisation is known; every other table with an
// organisation_id column holds tenant data and must be protected by row-level security.
const IDENTITY_TABLES = new Set(['organisations', 'memberships']);

describe('ADR-0004: tenant isolation', () => {
  it('every tenant table has row-level security enabled, forced and a tenant policy', async () => {
    const { rows } = await db().execute<{
      table: string;
      enabled: boolean;
      forced: boolean;
      policies: number;
    }>(sql`
      select c.relname as table, c.relrowsecurity as enabled, c.relforcerowsecurity as forced,
        (select count(*)::int from pg_policies p where p.tablename = c.relname and p.policyname = 'tenant_isolation') as policies
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join information_schema.columns col on col.table_name = c.relname and col.table_schema = n.nspname
      where n.nspname = 'public' and c.relkind = 'r' and col.column_name = 'organisation_id'`);
    const tenantTables = rows.filter((row) => !IDENTITY_TABLES.has(row.table));
    expect(tenantTables.length).toBeGreaterThan(0);
    for (const row of tenantTables) {
      expect(row, `${row.table} must be protected`).toMatchObject({
        enabled: true,
        forced: true,
        policies: 1,
      });
    }
  });

  it('an organisation sees only its own events', async () => {
    const a = await createTestMember();
    const b = await createTestMember();
    const seenByA = await withOrg(a.organisationId, (tx) => tx.select().from(events));
    expect(seenByA.length).toBeGreaterThan(0);
    expect(seenByA.every((e) => e.organisationId === a.organisationId)).toBe(true);
    const bRowsAsA = await withOrg(a.organisationId, (tx) =>
      tx.select().from(events).where(eq(events.organisationId, b.organisationId)),
    );
    expect(bRowsAsA).toEqual([]);
  });

  it('without an organisation, no tenant rows are visible', async () => {
    await createTestMember();
    expect(await db().select().from(events)).toEqual([]);
  });

  it('an organisation cannot write rows for another organisation', async () => {
    const a = await createTestMember();
    const b = await createTestMember();
    expect(
      await databaseError(
        withOrg(a.organisationId, (tx) =>
          recordEvent(tx, {
            organisationId: b.organisationId,
            actor: { type: 'system' },
            type: 'member.joined',
            data: { role: 'negotiator' },
          }),
        ),
      ),
    ).toMatch(/row-level security/);
  });

  it('system jobs can see every organisation, and only inside withSystem', async () => {
    const a = await createTestMember();
    const b = await createTestMember();
    const all = await withSystem((tx) => tx.select({ org: events.organisationId }).from(events));
    const orgs = new Set(all.map((row) => row.org));
    expect(orgs.has(a.organisationId) && orgs.has(b.organisationId)).toBe(true);
  });
});

describe('ADR-0006: the event log', () => {
  it('refuses updates and deletes', async () => {
    const member = await createTestMember();
    expect(
      await databaseError(
        withOrg(member.organisationId, (tx) =>
          tx
            .update(events)
            .set({ type: 'tampered' })
            .where(eq(events.organisationId, member.organisationId)),
        ),
      ),
    ).toMatch(/append-only/);
    expect(
      await databaseError(
        withOrg(member.organisationId, (tx) =>
          tx.delete(events).where(eq(events.organisationId, member.organisationId)),
        ),
      ),
    ).toMatch(/append-only/);
  });

  it('refuses a payload that could hold personal data', async () => {
    const member = await createTestMember();
    await expect(
      withOrg(member.organisationId, (tx) =>
        recordEvent(tx, {
          organisationId: member.organisationId,
          actor: { type: 'system' },
          type: 'member.joined',
          // @ts-expect-error: the catalogue only allows a role code here
          data: { role: 'Ann Power' },
        }),
      ),
    ).rejects.toThrow();
  });
});

describe('onboarding', () => {
  it('creates the organisation, an admin membership, a Gaff address, the record and (M23) the licence check', async () => {
    const member = await createTestMember({ organisation: 'Halcyon Lettings', kind: 'agency' });
    expect(member).toMatchObject({ role: 'admin', organisationKind: 'agency', name: 'Ann Power' });
    const [organisation] = await db()
      .select()
      .from(organisations)
      .where(eq(organisations.id, member.organisationId));
    expect(organisation?.inboundSlug).toMatch(/^halcyon-lettings(-\d+)?$/);
    expect(organisation?.approveBeforeSend).toBe(true);
    const types = await withOrg(member.organisationId, (tx) =>
      tx
        .select({ type: events.type, actor: events.actorType })
        .from(events)
        .orderBy(asc(events.id)),
    );
    expect(types).toEqual([
      { type: 'organisation.created', actor: 'person' },
      { type: 'member.joined', actor: 'person' },
      { type: 'letter_check.requested', actor: 'person' },
    ]);
  });

  it('gives every organisation its own Gaff address', async () => {
    const first = await createTestMember({ organisation: 'Same Name Lettings' });
    const second = await createTestMember({ organisation: 'Same Name Lettings' });
    const rows = await db()
      .select({ slug: organisations.inboundSlug })
      .from(organisations)
      .where(
        sql`${organisations.id} in (${sql.join([sql`${first.organisationId}`, sql`${second.organisationId}`], sql`, `)})`,
      );
    expect(new Set(rows.map((r) => r.slug)).size).toBe(2);
  });

  it('is safe to submit twice', async () => {
    const member = await createTestMember();
    const count = await db()
      .select({ n: sql<number>`count(*)::int` })
      .from(memberships)
      .where(eq(memberships.userId, member.userId));
    expect(count[0]?.n).toBe(1);
  });
});

describe('ADR-0007: decisions', () => {
  it('records who decided, for which organisation, with the basis', async () => {
    const member = await createTestMember();
    const decision = await withOrg(member.organisationId, (tx) =>
      recordDecision(tx, { member, kind: 'confirm_setup', lettingId: null, basis: { checks: 3 } }),
    );
    expect(decision).toMatchObject({ kind: 'confirm_setup', decidedByUserId: member.userId });
    const [row] = await withOrg(member.organisationId, (tx) =>
      tx
        .select()
        .from(decisions)
        .where(
          and(eq(decisions.id, decision.id), eq(decisions.organisationId, member.organisationId)),
        ),
    );
    expect(row?.decidedBy).toBe(member.userId);
  });

  it('refuses a basis that could hold personal data', async () => {
    const member = await createTestMember();
    await expect(
      withOrg(member.organisationId, (tx) =>
        recordDecision(tx, {
          member,
          kind: 'confirm_setup',
          lettingId: null,
          basis: { note: 'Ann liked them' },
        }),
      ),
    ).rejects.toThrow(/personal data/);
  });
});
