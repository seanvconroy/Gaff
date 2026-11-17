import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { shareCopy } from '@/copy/owner';
import { OWNER_LINK_TEMPLATE, ownerLinkEmail } from '@/copy/templates/owner';
import { withOrg } from '@/db/client';
import { accessLinks, landlords, lettings, organisations } from '@/db/schema';
import { letsOwnHomes } from '@/domain/organisations/kinds';
import { env } from '@/lib/env';
import { fieldErrors } from '@/lib/forms';
import { createAccessLink, hashToken } from '@/server/access/links';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { queueMessage } from '@/server/messages/outbox';
import { saveLandlordContactIn } from '@/server/offers/approval';
import { recordEvent } from '@/server/record/events';

const activeLandlordLinks = (lettingId: string) =>
  and(
    eq(accessLinks.purpose, 'landlord'),
    eq(accessLinks.subjectId, lettingId),
    isNull(accessLinks.revokedAt),
    gt(accessLinks.expiresAt, new Date()),
  );

const ownerSchema = z.object({
  name: z.string().trim().min(1, shareCopy.problems.name).max(120, shareCopy.problems.name),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: shareCopy.problems.email })),
});

export type ShareResult =
  { ok: true; ownerName: string } | { ok: false; errors: Record<string, string> };

/**
 * R27, UX-OW-1: the agent shares a letting with its owner, at any point after it's created, by
 * giving their name and email. Gaff emails the owner a private link to a read-only page (Q4),
 * with no account. Gaff keeps only the link's hash, so a lost link is replaced, not recovered:
 * sharing again sends a new link, and the one before stops working, so a link sent to a wrong
 * address is never left open.
 */
export async function shareWithOwner(
  member: Member,
  lettingId: string,
  values: { name: string; email: string },
): Promise<ShareResult> {
  const parsed = ownerSchema.safeParse(values);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const owner = parsed.data;
  return withOrg(member.organisationId, async (tx) => {
    const [row] = await tx
      .select({
        address: lettings.addressLine1,
        area: lettings.area,
        operatorName: organisations.name,
        kind: organisations.kind,
      })
      .from(lettings)
      .innerJoin(organisations, eq(organisations.id, lettings.organisationId))
      .where(eq(lettings.id, lettingId));
    if (!row) throw new UserFacingError(shareCopy.problems.notFound);
    // A landlord letting their own home is its owner: there's nobody to share it with.
    if (letsOwnHomes(row.kind)) throw new UserFacingError(shareCopy.problems.ownHome);
    await saveLandlordContactIn(tx, member, lettingId, owner);
    const replaced = await tx
      .update(accessLinks)
      .set({ revokedAt: new Date() })
      .where(activeLandlordLinks(lettingId))
      .returning({ id: accessLinks.id });
    const token = await createAccessLink(tx, {
      organisationId: member.organisationId,
      purpose: 'landlord',
      subjectId: lettingId,
    });
    const [link] = await tx
      .select({ id: accessLinks.id })
      .from(accessLinks)
      .where(eq(accessLinks.tokenHash, hashToken(token)));
    await queueMessage(tx, {
      organisationId: member.organisationId,
      lettingId,
      applicationId: null,
      kind: 'owner_link',
      author: 'template',
      templateKey: OWNER_LINK_TEMPLATE,
      toAddress: owner.email,
      ...ownerLinkEmail({
        ownerName: owner.name,
        operatorName: row.operatorName,
        address: row.address,
        area: row.area,
        followUrl: `${env().APP_URL}/l/${token}`,
      }),
    });
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'letting.shared_with_landlord',
      subject: { type: 'access_link', id: link!.id },
      data: { linkId: link!.id, replaced: replaced.length },
    });
    return { ok: true, ownerName: owner.name };
  });
}

/** R27, UX-OW-4: stops every owner's link for the letting working, straight away. */
export async function stopSharingWithLandlord(member: Member, lettingId: string): Promise<number> {
  return withOrg(member.organisationId, async (tx) => {
    const revoked = await tx
      .update(accessLinks)
      .set({ revokedAt: new Date() })
      .where(activeLandlordLinks(lettingId))
      .returning({ id: accessLinks.id });
    if (revoked.length > 0) {
      await recordEvent(tx, {
        organisationId: member.organisationId,
        lettingId,
        actor: { type: 'person', userId: member.userId },
        type: 'letting.landlord_link_revoked',
        data: { links: revoked.length },
      });
    }
    return revoked.length;
  });
}

/**
 * Whether the letting can be shared with an owner, who the owner is, whether it's shared now,
 * and when they last looked. Null where there's no such letting.
 */
export async function landlordSharing(member: Member, lettingId: string) {
  return withOrg(member.organisationId, async (tx) => {
    const [row] = await tx
      .select({
        address: lettings.addressLine1,
        kind: organisations.kind,
        ownerName: landlords.name,
        ownerEmail: landlords.email,
      })
      .from(lettings)
      .innerJoin(organisations, eq(organisations.id, lettings.organisationId))
      .leftJoin(landlords, eq(landlords.id, lettings.landlordId))
      .where(eq(lettings.id, lettingId));
    if (!row) return null;
    const links = await tx
      .select({ lastUsedAt: accessLinks.lastUsedAt, createdAt: accessLinks.createdAt })
      .from(accessLinks)
      .where(activeLandlordLinks(lettingId))
      .orderBy(desc(accessLinks.createdAt));
    const opened = links
      .map((l) => l.lastUsedAt)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => b.getTime() - a.getTime());
    return {
      address: row.address,
      /** UX-OW-1: only a home let for someone else has an owner to share it with. */
      canShare: !letsOwnHomes(row.kind),
      owner:
        row.ownerName && row.ownerEmail ? { name: row.ownerName, email: row.ownerEmail } : null,
      shared: links.length > 0,
      lastOpenedAt: opened[0] ?? null,
    };
  });
}
