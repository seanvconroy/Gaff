import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import { accessLinks, lettings } from '@/db/schema';
import { env } from '@/lib/env';
import { createAccessLink, hashToken } from '@/server/access/links';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { recordEvent } from '@/server/record/events';

const activeLandlordLinks = (lettingId: string) =>
  and(
    eq(accessLinks.purpose, 'landlord'),
    eq(accessLinks.subjectId, lettingId),
    isNull(accessLinks.revokedAt),
    gt(accessLinks.expiresAt, new Date()),
  );

/**
 * R27: a private, read-only link for the landlord (Q4). The link is shown once, to the
 * operator, to send on; Gaff keeps only its hash, so a lost link is replaced, not recovered.
 */
export async function shareWithLandlord(member: Member, lettingId: string): Promise<string> {
  return withOrg(member.organisationId, async (tx) => {
    const [letting] = await tx
      .select({ id: lettings.id })
      .from(lettings)
      .where(eq(lettings.id, lettingId));
    if (!letting) throw new UserFacingError('We couldn’t find that letting.');
    const token = await createAccessLink(tx, {
      organisationId: member.organisationId,
      purpose: 'landlord',
      subjectId: lettingId,
    });
    const [link] = await tx
      .select({ id: accessLinks.id })
      .from(accessLinks)
      .where(eq(accessLinks.tokenHash, hashToken(token)));
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'letting.shared_with_landlord',
      subject: { type: 'access_link', id: link!.id },
      data: { linkId: link!.id },
    });
    return `${env().APP_URL}/l/${token}`;
  });
}

/** R27: stops every landlord link for the letting working, straight away. */
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

/** Whether the letting is shared with the landlord, and when they last looked. */
export async function landlordSharing(member: Member, lettingId: string) {
  const links = await withOrg(member.organisationId, (tx) =>
    tx
      .select({ lastUsedAt: accessLinks.lastUsedAt, createdAt: accessLinks.createdAt })
      .from(accessLinks)
      .where(activeLandlordLinks(lettingId))
      .orderBy(desc(accessLinks.createdAt)),
  );
  const opened = links
    .map((l) => l.lastUsedAt)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime());
  return { shared: links.length > 0, lastOpenedAt: opened[0] ?? null };
}
