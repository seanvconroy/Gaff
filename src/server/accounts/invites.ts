import { and, eq, gt, lt } from 'drizzle-orm';
import { db, scopeToOrg, scopeToPerson, type Tx, withSystem } from '@/db/client';
import { organisationInvites, users } from '@/db/schema';
import { recordFunnelStep } from '@/server/funnels/steps';
import { addMemberIn } from '@/server/organisations/create-organisation';
import type { SignedInPerson } from './contexts';
import { saveProfileIn } from './profile';

/** UX-AG-12: an invite lasts seven days. */
export const INVITE_LASTS_DAYS = 7;

/**
 * UX-AG-5 (Q32): a person who signs in with an invited address, verified, joins the agency with
 * no questions: the invitation is the confirmation. Called as sign-in finishes, and from the
 * invite email's button for someone already signed in.
 *
 * It looks across organisations, because nobody knows yet which the person belongs to; it reads
 * only the invites sent to this person's own verified address. An invite works once: it is
 * deleted as it's accepted. Returns the organisations joined.
 */
export async function acceptInvites(person: SignedInPerson, now = new Date()): Promise<string[]> {
  // An address nobody has verified proves nothing about who holds it.
  if (!person.emailVerified) return [];
  const email = person.email.trim().toLowerCase();
  return withSystem(async (tx) => {
    const invites = await tx
      .delete(organisationInvites)
      .where(and(eq(organisationInvites.email, email), gt(organisationInvites.expiresAt, now)))
      .returning({
        organisationId: organisationInvites.organisationId,
        role: organisationInvites.role,
      });
    if (invites.length === 0) return [];
    for (const invite of invites) {
      await scopeToOrg(tx, invite.organisationId);
      await addMemberIn(tx, invite.organisationId, person.id, invite.role, {
        type: 'person',
        userId: person.id,
      });
    }
    await scopeToPerson(tx, person.id);
    await saveProfileIn(tx, person.id, {
      lastSide: 'letting',
      lastOrganisationId: invites[0]!.organisationId,
      firstRunPurpose: null,
      firstRunRegisterEntryId: null,
    });
    // First run ends here for someone invited: they made no organisation of their own.
    await recordFunnelStep(tx, {
      step: 'first_run.set_up_finished',
      subjectId: person.id,
      variant: 'agency',
    });
    return invites.map((invite) => invite.organisationId);
  });
}

/** The same, for someone known only by their ID, as sign-in finishes. */
export async function acceptInvitesFor(userId: string): Promise<string[]> {
  const [person] = await db()
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      emailVerified: users.emailVerified,
    })
    .from(users)
    .where(eq(users.id, userId));
  return person ? acceptInvites(person) : [];
}

/** Rule 9: an invite holds an email address, so one that has expired is deleted by the daily job. */
export async function purgeExpiredInvites(tx: Tx, now: Date): Promise<number> {
  const gone = await tx
    .delete(organisationInvites)
    .where(lt(organisationInvites.expiresAt, now))
    .returning({ id: organisationInvites.id });
  return gone.length;
}
