import { and, eq, isNull, ne } from 'drizzle-orm';
import { db, withOrg } from '@/db/client';
import { letterChecks, memberships, organisations } from '@/db/schema';
import {
  agencyProfileSchema,
  memberProfileSchema,
  type AgencyProfile,
  type MemberProfile,
} from '@/domain/organisations/profile';
import { slugify } from '@/domain/places/slug';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { recordEvent } from '@/server/record/events';
import { requestLicenceCheck } from '@/server/verification/licence';

type Result = { ok: true } | { ok: false; errors: Record<string, string> };

function errorsOf(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) errors[String(issue.path[0] ?? 'form')] ??= issue.message;
  return errors;
}

/** M17: a slug for the organisation's public page, unique across Gaff. */
export async function uniqueOrganisationSlug(name: string, except?: string): Promise<string> {
  const base = slugify(name) || 'letter';
  for (let n = 1; n <= 50; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const [taken] = await db()
      .select({ id: organisations.id })
      .from(organisations)
      .where(
        except
          ? and(eq(organisations.slug, candidate), ne(organisations.id, except))
          : eq(organisations.slug, candidate),
      );
    if (!taken) return candidate;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * M17: an admin edits the agency's public profile. A new legal name sends the agency's licence
 * back to the check queue, since the register is matched on it.
 */
export async function updateAgencyProfile(
  member: Member,
  values: Record<string, string>,
): Promise<Result> {
  if (member.role !== 'admin') throw new UserFacingError('Only an admin can change this.');
  const parsed = agencyProfileSchema.safeParse(values);
  if (!parsed.success) return { ok: false, errors: errorsOf(parsed.error) };
  const profile: AgencyProfile = parsed.data;
  const [current] = await db()
    .select({
      legalName: organisations.legalName,
      slug: organisations.slug,
      name: organisations.name,
    })
    .from(organisations)
    .where(eq(organisations.id, member.organisationId));
  const slug =
    current!.slug ?? (await uniqueOrganisationSlug(current!.name, member.organisationId));

  await withOrg(member.organisationId, async (tx) => {
    await tx
      .update(organisations)
      .set({
        legalName: profile.legalName,
        officeAddress: profile.officeAddress ?? null,
        publicPhone: profile.publicPhone ?? null,
        website: profile.website ?? null,
        about: profile.about ?? null,
        slug,
      })
      .where(eq(organisations.id, member.organisationId));
    if (current!.legalName && current!.legalName !== profile.legalName) {
      await tx
        .update(letterChecks)
        .set({ status: 'pending', checkedAt: null, checkedBy: null, reason: null })
        .where(
          and(
            eq(letterChecks.organisationId, member.organisationId),
            isNull(letterChecks.userId),
            eq(letterChecks.method, 'psra_register'),
          ),
        );
    }
    await recordEvent(tx, {
      organisationId: member.organisationId,
      actor: { type: 'person', userId: member.userId },
      type: 'profile.updated',
      data: { whose: 'organisation' },
    });
  });
  return { ok: true };
}

/** M18: anyone edits their own public details; an agent's licence goes to the check queue. */
export async function updateMyProfile(
  member: Member,
  values: Record<string, string>,
): Promise<Result> {
  const parsed = memberProfileSchema.safeParse(values);
  if (!parsed.success) return { ok: false, errors: errorsOf(parsed.error) };
  const profile: MemberProfile = parsed.data;
  if (member.organisationKind === 'agency' && !profile.psraLicenceNumber) {
    return {
      ok: false,
      errors: { psraLicenceNumber: 'Enter the number on your own PSRA licence, like 001234' },
    };
  }
  await db()
    .update(memberships)
    .set({
      displayName: profile.displayName,
      psraLicenceNumber: member.organisationKind === 'agency' ? profile.psraLicenceNumber! : null,
      showPhone: profile.showPhone,
      publicPhone: profile.showPhone ? profile.publicPhone! : null,
    })
    .where(
      and(
        eq(memberships.organisationId, member.organisationId),
        eq(memberships.userId, member.userId),
      ),
    );
  await withOrg(member.organisationId, async (tx) => {
    if (member.organisationKind === 'agency') {
      await requestLicenceCheck(tx, {
        organisationId: member.organisationId,
        userId: member.userId,
        licenceNumber: profile.psraLicenceNumber!,
        by: member.userId,
      });
    }
    await recordEvent(tx, {
      organisationId: member.organisationId,
      actor: { type: 'person', userId: member.userId },
      type: 'profile.updated',
      data: { whose: 'member' },
    });
  });
  return { ok: true };
}
