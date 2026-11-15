import { sql, type SQL } from 'drizzle-orm';
import { withSystem } from '@/db/client';
import { events, funnelEvents, organisations } from '@/db/schema';
import { recordSources, type RecordSource } from '@/domain/funnels/catalogue';
import { allFunnelReports, type Fact, type FunnelReport } from '@/domain/funnels/report';
import type { Staff } from '@/server/auth/staff';

function subjectOf(source: RecordSource): SQL {
  if (source.subject === 'organisation') return sql`${events.organisationId}::text`;
  if (source.subject === 'letting') return sql`${events.lettingId}::text`;
  if (source.subject === 'actor') return sql`${events.actorId}`;
  return sql`${events.data}->>${source.subject.data}`;
}

/** The first time each subject reached a step, from the events the record already holds. */
function factsFromRecord(step: string, source: RecordSource): SQL {
  const subject = subjectOf(source);
  const conditions = [sql`${events.type} = ${source.event}`, sql`${subject} is not null`];
  for (const [key, value] of Object.entries(source.where ?? {})) {
    conditions.push(
      typeof value === 'string' || typeof value === 'boolean'
        ? sql`${events.data} @> ${JSON.stringify({ [key]: value })}::jsonb`
        : sql`${events.data}->>${key} in (${sql.join(
            value.map((code) => sql`${code}`),
            sql`, `,
          )})`,
    );
  }
  if (source.organisationKind) {
    conditions.push(
      sql`exists (select 1 from ${organisations} where ${organisations.id} = ${events.organisationId} and ${organisations.kind} = ${source.organisationKind})`,
    );
  }
  const variant = source.variant
    ? sql`(array_agg(${events.data}->>${source.variant} order by ${events.occurredAt}))[1]`
    : sql`null::text`;
  return sql`(select ${step}::text as step, ${subject} as subject, min(${events.occurredAt}) as at, ${variant} as variant
    from ${events} where ${sql.join(conditions, sql` and `)} group by 2)`;
}

/**
 * UX-ME-2: every funnel fact, from Gaff's own events, across all organisations. This is one of
 * the few places that reads across organisations (withSystem), and it reads only step codes,
 * IDs and times: no table that holds a name or a contact detail is touched. The IDs stay on the
 * server; only counts leave it, through funnelReportsFor.
 */
export async function funnelFacts(): Promise<Fact[]> {
  const fromRecord = recordSources().map(({ step, source }) => factsFromRecord(step, source));
  const fromFunnelEvents = sql`(select ${funnelEvents.step} as step, ${funnelEvents.subjectId}::text as subject, ${funnelEvents.occurredAt} as at, ${funnelEvents.variant} as variant from ${funnelEvents})`;
  const { rows } = await withSystem((tx) =>
    tx.execute<{ step: string; subject: string; at: Date | string; variant: string | null }>(
      sql.join([...fromRecord, fromFunnelEvents], sql` union all `),
    ),
  );
  return rows.map((row) => ({
    step: row.step,
    subject: row.subject,
    at: row.at instanceof Date ? row.at : new Date(row.at),
    variant: row.variant,
  }));
}

/** Gaff's internal page: each funnel's counts, shares and median times. For staff only. */
export async function funnelReportsFor(_staff: Staff): Promise<FunnelReport[]> {
  return allFunnelReports(await funnelFacts());
}
