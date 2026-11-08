import { and, eq } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import { checks } from '@/db/schema';
import { openJson, sealJson } from '@/lib/crypto';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { recordEvent } from '@/server/record/events';

interface SealedIdentity {
  verifiedName: string | null;
  selfie: boolean;
  inPersonNeeded: boolean;
  checkedAt: string | null;
  seenName?: string;
  seenAt?: string;
}

/**
 * P27: for a renter checked without a selfie, or whose ID couldn't be checked online, the letter
 * sees an original photo ID when they meet, before the agreement is sent, and records the name on
 * it. Gaff records who recorded it and when, never the document.
 */
export async function inPersonIdentity(member: Member, applicationId: string) {
  const [row] = await withOrg(member.organisationId, (tx) =>
    tx
      .select({ resultSealed: checks.resultSealed })
      .from(checks)
      .where(and(eq(checks.applicationId, applicationId), eq(checks.kind, 'identity'))),
  );
  if (!row?.resultSealed) return null;
  const result = openJson<SealedIdentity>(row.resultSealed);
  return {
    needed: result.inPersonNeeded,
    // P19 or P20: checked by Stripe without a selfie, or not checked online at all.
    why: result.verifiedName ? ('no_selfie' as const) : ('offline' as const),
    seen:
      result.seenName && result.seenAt
        ? { name: result.seenName, at: new Date(result.seenAt) }
        : null,
  };
}

export async function recordIdSeenInPerson(
  member: Member,
  applicationId: string,
  name: string,
  now = new Date(),
): Promise<void> {
  const seenName = name.trim().slice(0, 120);
  if (seenName.length < 2) throw new UserFacingError('Enter the name on their photo ID.');
  await withOrg(member.organisationId, async (tx) => {
    const [row] = await tx
      .select()
      .from(checks)
      .where(and(eq(checks.applicationId, applicationId), eq(checks.kind, 'identity')))
      .for('update');
    if (!row?.resultSealed) throw new UserFacingError('There’s no ID check for this renter.');
    const result = openJson<SealedIdentity>(row.resultSealed);
    await tx
      .update(checks)
      .set({ resultSealed: sealJson({ ...result, seenName, seenAt: now.toISOString() }) })
      .where(eq(checks.id, row.id));
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId: row.lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'check.recorded_in_person',
      subject: { type: 'check', id: row.id },
      data: { applicationId, checkId: row.id },
    });
  });
}
