import { and, eq, isNull, or } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import { letterChecks } from '@/db/schema';
import {
  missingChecks,
  type CheckRecord,
  type MissingCheck,
} from '@/domain/verification/readiness';
import type { Member } from '@/server/auth/member';
import { confirmedMobile } from './mobile';

export interface Readiness {
  missing: MissingCheck[];
  organisation: CheckRecord[];
  member: CheckRecord[];
  mobile: string | null;
}

/** M22: what's been checked about this letter, and what's left before their homes go live. */
export async function letterReadiness(member: Member): Promise<Readiness> {
  const rows = await withOrg(member.organisationId, (tx) =>
    tx
      .select({
        userId: letterChecks.userId,
        method: letterChecks.method,
        status: letterChecks.status,
        checkedAt: letterChecks.checkedAt,
        licenceNumber: letterChecks.licenceNumber,
        reason: letterChecks.reason,
      })
      .from(letterChecks)
      .where(
        and(
          eq(letterChecks.organisationId, member.organisationId),
          or(isNull(letterChecks.userId), eq(letterChecks.userId, member.userId)),
        ),
      ),
  );
  const mobile = await confirmedMobile(member.userId);
  const organisation = rows.filter((r) => r.userId === null);
  const own: CheckRecord[] = rows.filter((r) => r.userId === member.userId);
  if (mobile) own.push({ method: 'mobile', status: 'passed' });
  return {
    missing: missingChecks({ kind: member.organisationKind, organisation, member: own }),
    organisation,
    member: own,
    mobile,
  };
}

/** M30: the names Gaff has checked for this organisation: a verified ID, or the agency's names. */
export async function checkedNames(organisationId: string): Promise<string[]> {
  const rows = await withOrg(organisationId, (tx) =>
    tx
      .select({ verifiedName: letterChecks.verifiedName, method: letterChecks.method })
      .from(letterChecks)
      .where(
        and(eq(letterChecks.organisationId, organisationId), eq(letterChecks.status, 'passed')),
      ),
  );
  return rows.flatMap((r) =>
    r.method === 'id_document' && r.verifiedName ? [r.verifiedName] : [],
  );
}

/** M30: whether the agency's own licence has passed its check. */
export async function agencyLicenceChecked(organisationId: string): Promise<boolean> {
  const [row] = await withOrg(organisationId, (tx) =>
    tx
      .select({ id: letterChecks.id })
      .from(letterChecks)
      .where(
        and(
          eq(letterChecks.organisationId, organisationId),
          isNull(letterChecks.userId),
          eq(letterChecks.method, 'psra_register'),
          eq(letterChecks.status, 'passed'),
        ),
      ),
  );
  return Boolean(row);
}
