import { and, eq, isNull } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import { applications, checks } from '@/db/schema';
import { normaliseEmail } from '@/domain/enquiries/parse';
import { resolveAccessLink } from '@/server/access/links';
import { identityWithName, refreshCopies, shareIdentity, startIdentity } from './identity';

const CHOSEN = ['preferred', 'backup'];

/**
 * P15, P16 (Q48): a chosen renter checks their identity on their checks page, once. Whoever
 * enquired, on Gaff, Daft or MyHome, first confirms the application's email with a code, which
 * gives them a Gaff account and profile: the check is then kept for every later home.
 */
export async function chosenApplication(token: string) {
  const link = await resolveAccessLink(token, 'renter');
  if (!link) return null;
  const [row] = await withOrg(link.organisationId, (tx) =>
    tx
      .select({
        id: applications.id,
        organisationId: applications.organisationId,
        lettingId: applications.lettingId,
        email: applications.email,
        emailNormalised: applications.emailNormalised,
        renterUserId: applications.renterUserId,
        status: applications.status,
      })
      .from(applications)
      .where(eq(applications.id, link.subjectId)),
  );
  if (!row || !CHOSEN.includes(row.status)) return null;
  return row;
}

/**
 * Links the application to the signed-in person, once they've confirmed its email address with
 * a code. Only the application's own email can claim it. Then their identity, if already
 * checked, is shared with this letting straight away (P29).
 */
export async function claimApplication(
  token: string,
  user: { id: string; email: string },
): Promise<boolean> {
  const application = await chosenApplication(token);
  if (!application) return false;
  if (application.renterUserId && application.renterUserId !== user.id) return false;
  if (normaliseEmail(user.email) !== application.emailNormalised) return false;
  if (!application.renterUserId) {
    await withOrg(application.organisationId, (tx) =>
      tx
        .update(applications)
        .set({ renterUserId: user.id })
        .where(and(eq(applications.id, application.id), isNull(applications.renterUserId))),
    );
  }
  await refreshCopies(user.id);
  return true;
}

/** Is the signed-in person this application's renter? */
export async function isApplicationsRenter(token: string, userId: string | null) {
  if (!userId) return false;
  const application = await chosenApplication(token);
  return application?.renterUserId === userId;
}

export async function startRenterIdentity(
  token: string,
  userId: string,
  input: { consented: boolean },
) {
  if (!(await isApplicationsRenter(token, userId))) return { problem: 'not_yours' as const };
  return startIdentity(userId, { ...input, returnTo: 'renter' });
}

/**
 * P29: when a renter is chosen, their identity check is filled from their profile at once if
 * they've checked before. Called in the same transaction that asks for the checks (R18).
 */
export async function shareProfileIdentity(
  tx: Parameters<Parameters<typeof withOrg>[1]>[0],
  applicationId: string,
): Promise<void> {
  const [row] = await tx
    .select({
      checkId: checks.id,
      organisationId: checks.organisationId,
      lettingId: checks.lettingId,
      renterUserId: applications.renterUserId,
    })
    .from(checks)
    .innerJoin(applications, eq(applications.id, checks.applicationId))
    .where(and(eq(checks.applicationId, applicationId), eq(checks.kind, 'identity')));
  if (!row?.renterUserId) return;
  const identity = await identityWithName(row.renterUserId);
  if (!identity) return;
  await shareIdentity(
    tx,
    {
      checkId: row.checkId,
      organisationId: row.organisationId,
      lettingId: row.lettingId,
      applicationId,
    },
    identity,
  );
}
