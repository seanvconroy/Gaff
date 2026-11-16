import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db, scopeToOrg, withSystem } from '@/db/client';
import {
  memberships,
  organisationInvites,
  organisations,
  psraRegister,
  users,
} from '@/db/schema';
import { type BusinessLicenceType } from '@/domain/register/parse';
import { agencyNameFrom, licenceNumberSchema } from '@/domain/register/search';
import type { Staff } from '@/server/auth/staff';
import { UserFacingError } from '@/server/errors';
import { enqueue } from '@/server/jobs/enqueue';
import { releaseHeldLettings } from '@/server/lettings/go-live';
import { createOrganisationIn } from '@/server/organisations/create-organisation';
import { recordEvent } from '@/server/record/events';
import { INVITE_LASTS_DAYS } from './invites';

/**
 * UX-AG-4, UX-AG-5 (Q32): what Gaff's own team does for agencies, from the internal page. Every
 * function takes a `Staff`, which only `requireStaff()` makes (src/server/auth/staff.ts).
 *
 * Staff confirm that a person works for an agency, and set a pilot agency up with its first
 * admin's invitation. That is all: nothing here opens a letting, sends a renter a message or
 * makes a decision about anyone (Q13). A home that goes live on confirmation does so on the
 * decision its own member already made (`releaseHeldLettings`).
 */
export interface AgencyWaiting {
  organisationId: string;
  name: string;
  licenceNumber: string;
  registeredName: string;
  tradingName: string | null;
  licenceType: BusinessLicenceType;
  county: string;
  askedAt: Date;
  /** Who claimed it: the person Gaff confirms works there. */
  admins: Array<{ name: string; email: string }>;
  /** A confirmed agency already holds this licence: this claim can't be confirmed. */
  licenceTaken: boolean;
}

/**
 * The agencies that signed up by themselves and are waiting for someone at Gaff to confirm that
 * their first admin works there, oldest first. It reads the organisations, their register
 * entries and their admins' names and addresses, which staff need to make the check: nothing of
 * any letting, renter or message.
 */
export async function agenciesWaitingFor(_staff: Staff): Promise<AgencyWaiting[]> {
  const waiting = await db()
    .select({
      organisationId: organisations.id,
      name: organisations.name,
      askedAt: organisations.createdAt,
      registerEntryId: psraRegister.id,
      licenceNumber: psraRegister.licenceNumber,
      registeredName: psraRegister.registeredName,
      tradingName: psraRegister.tradingName,
      licenceType: psraRegister.licenceType,
      county: psraRegister.county,
    })
    .from(organisations)
    .innerJoin(psraRegister, eq(psraRegister.id, organisations.psraRegisterEntryId))
    .where(and(eq(organisations.kind, 'agency'), isNull(organisations.confirmedAt)))
    .orderBy(asc(organisations.createdAt));
  const result: AgencyWaiting[] = [];
  for (const { registerEntryId, ...agency } of waiting) {
    const admins = await db()
      .select({ name: users.name, email: users.email })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(eq(memberships.organisationId, agency.organisationId), eq(memberships.role, 'admin')),
      )
      .orderBy(asc(memberships.createdAt));
    const [taken] = await db()
      .select({ id: organisations.id })
      .from(organisations)
      .where(
        and(
          eq(organisations.psraRegisterEntryId, registerEntryId),
          isNotNull(organisations.confirmedAt),
        ),
      );
    result.push({
      ...agency,
      licenceType: agency.licenceType as BusinessLicenceType,
      admins,
      licenceTaken: Boolean(taken),
    });
  }
  return result;
}

/**
 * UX-AG-4 (Q32): "Confirm". Someone at Gaff has checked, on the agency's own website or by
 * ringing its published number, that the person who claimed it works there. One press, once per
 * agency. Its admins are emailed, and any home a member already decided to put live goes live.
 */
export async function confirmAgency(
  staff: Staff,
  organisationId: string,
): Promise<{ confirmed: boolean; wentLive: number }> {
  if (!z.uuid().safeParse(organisationId).success) {
    throw new UserFacingError('We couldn’t find that agency.');
  }
  return db().transaction(async (tx) => {
    await scopeToOrg(tx, organisationId);
    const [agency] = await tx
      .select()
      .from(organisations)
      .where(eq(organisations.id, organisationId))
      .for('update');
    if (!agency || agency.kind !== 'agency') {
      throw new UserFacingError('We couldn’t find that agency.');
    }
    if (agency.confirmedAt) return { confirmed: false, wentLive: 0 };
    if (!agency.psraRegisterEntryId) {
      throw new UserFacingError('This agency has no licence on the register yet.');
    }
    const [entry] = await tx
      .select({ removedAt: psraRegister.removedAt })
      .from(psraRegister)
      .where(eq(psraRegister.id, agency.psraRegisterEntryId));
    if (!entry || entry.removedAt) {
      throw new UserFacingError('This agency’s licence isn’t on the register now.');
    }
    const [holder] = await tx
      .select({ id: organisations.id })
      .from(organisations)
      .where(
        and(
          eq(organisations.psraRegisterEntryId, agency.psraRegisterEntryId),
          isNotNull(organisations.confirmedAt),
        ),
      );
    if (holder) {
      throw new UserFacingError('A confirmed agency on Gaff already holds this licence.');
    }
    await tx
      .update(organisations)
      .set({ confirmedAt: new Date(), confirmedBy: staff.userId })
      .where(eq(organisations.id, organisationId));
    await recordEvent(tx, {
      organisationId,
      actor: { type: 'staff', userId: staff.userId },
      type: 'organisation.confirmed',
      data: { how: 'checked' },
    });
    const released = await releaseHeldLettings(tx, organisationId);
    await enqueue(tx, 'send_account_email', {
      kind: 'agency_confirmed',
      organisationId,
      wentLive: released.live,
    });
    return { confirmed: true, wentLive: released.live };
  });
}

export const pilotAgencySchema = z.object({
  licenceNumber: licenceNumberSchema,
  adminEmail: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email('Enter the first admin’s email address, like ann@example.ie')),
});

/**
 * UX-AG-5 (Q32): a founder sets a pilot agency up, already confirmed, and invites its first
 * admin by email. The invitation is the confirmation: the admin signs in with that address and
 * lands in the agency with no questions (./invites.ts).
 */
export async function createPilotAgency(
  staff: Staff,
  input: { licenceNumber: string; adminEmail: string },
): Promise<
  { ok: true; organisationId: string; agencyName: string } | { ok: false; errors: Record<string, string> }
> {
  const parsed = pilotAgencySchema.safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { ok: false, errors };
  }
  // A founder acts across organisations here: finding the register entry, then making a new one.
  return withSystem(async (tx) => {
    const [entry] = await tx
      .select()
      .from(psraRegister)
      .where(
        and(eq(psraRegister.licenceNumber, parsed.data.licenceNumber), isNull(psraRegister.removedAt)),
      );
    if (!entry) {
      return {
        ok: false,
        errors: { licenceNumber: 'That number isn’t among the agencies licensed to let.' },
      } as const;
    }
    const [holder] = await tx
      .select({ id: organisations.id })
      .from(organisations)
      .where(
        and(eq(organisations.psraRegisterEntryId, entry.id), isNotNull(organisations.confirmedAt)),
      );
    if (holder) {
      return {
        ok: false,
        errors: { licenceNumber: 'That agency is already on Gaff, and confirmed.' },
      } as const;
    }
    const now = new Date();
    const { organisationId } = await createOrganisationIn(tx, {
      kind: 'agency',
      name: agencyNameFrom(entry),
      psraRegisterEntryId: entry.id,
      psraLicenceNumber: entry.licenceNumber,
      confirmed: { at: now, by: staff.userId },
      adminUserId: null,
      // Nobody set this agency up for themselves, so no person's first run is counted for it.
      actor: { type: 'system' },
    });
    await recordEvent(tx, {
      organisationId,
      actor: { type: 'staff', userId: staff.userId },
      type: 'organisation.confirmed',
      data: { how: 'invited' },
    });
    const [invite] = await tx
      .insert(organisationInvites)
      .values({
        organisationId,
        email: parsed.data.adminEmail,
        role: 'admin',
        invitedBy: staff.userId,
        expiresAt: new Date(now.getTime() + INVITE_LASTS_DAYS * 86_400_000),
      })
      .returning({ id: organisationInvites.id });
    await recordEvent(tx, {
      organisationId,
      actor: { type: 'staff', userId: staff.userId },
      type: 'member.invited',
      data: { inviteId: invite!.id, role: 'admin' },
    });
    await enqueue(tx, 'send_account_email', {
      kind: 'agency_invite',
      organisationId,
      inviteId: invite!.id,
    });
    return { ok: true, organisationId, agencyName: agencyNameFrom(entry) } as const;
  });
}
