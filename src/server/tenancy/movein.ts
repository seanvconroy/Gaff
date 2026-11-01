import { and, asc, eq } from 'drizzle-orm';
import { withOrg, type Tx } from '@/db/client';
import { applications, inventoryItems, lettings, organisations, tenancies } from '@/db/schema';
import { INVENTORY_SHARED_TEMPLATE, inventorySharedEmail } from '@/copy/templates/tenancy';
import {
  MAX_PHOTO_BYTES,
  checklistSchema,
  inventoryItemSchema,
  photoKind,
  stripJpegMetadata,
} from '@/domain/tenancy/movein';
import { env } from '@/lib/env';
import { createAccessLink, resolveAccessLink } from '@/server/access/links';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { queueMessage } from '@/server/messages/outbox';
import { recordEvent } from '@/server/record/events';

async function tenancyOf(tx: Tx, lettingId: string) {
  const [tenancy] = await tx.select().from(tenancies).where(eq(tenancies.lettingId, lettingId));
  if (!tenancy) throw new UserFacingError('There’s no tenancy for this home yet.');
  return tenancy;
}

/** R25: the move-in checklist. Handing over the keys is when the tenant moves in. */
export async function saveChecklist(
  member: Member,
  lettingId: string,
  values: Record<string, string>,
): Promise<void> {
  const parsed = checklistSchema.safeParse(values);
  if (!parsed.success) throw new UserFacingError(parsed.error.issues[0]!.message);
  await withOrg(member.organisationId, async (tx) => {
    const tenancy = await tenancyOf(tx, lettingId);
    const keys = parsed.data.keys === 'yes';
    await tx
      .update(tenancies)
      .set({
        moveInChecklist: parsed.data,
        moveInCompletedAt: keys ? (tenancy.moveInCompletedAt ?? new Date()) : null,
      })
      .where(eq(tenancies.id, tenancy.id));
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'movein.checklist_saved',
      subject: { type: 'tenancy', id: tenancy.id },
      data: { tenancyId: tenancy.id, keysHandedOver: keys },
    });
  });
}

export type AddItemResult = { ok: true } | { ok: false; errors: Record<string, string> };

/**
 * R25: one inventory item, with a photo if there is one. Photos are checked by their real type,
 * kept under 4 MB, and stripped of location and camera details.
 */
export async function addInventoryItem(
  member: Member,
  lettingId: string,
  values: Record<string, string>,
  photo: Buffer | null,
): Promise<AddItemResult> {
  const parsed = inventoryItemSchema.safeParse(values);
  const errors: Record<string, string> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
  }
  let stored: { bytes: Buffer; type: string } | null = null;
  if (photo && photo.length > 0) {
    const kind = photoKind(photo);
    if (photo.length > MAX_PHOTO_BYTES) errors.photo = 'That photo is too big. Try one under 4 MB.';
    else if (!kind) errors.photo = 'That isn’t a photo Gaff can use. Try a JPEG, PNG or WebP.';
    else if (kind === 'image/jpeg') {
      const clean = stripJpegMetadata(photo);
      if (!clean) errors.photo = 'We couldn’t read that photo. Try another.';
      else stored = { bytes: clean, type: kind };
    } else stored = { bytes: photo, type: kind };
  }
  if (!parsed.success || Object.keys(errors).length > 0) return { ok: false, errors };
  await withOrg(member.organisationId, async (tx) => {
    const tenancy = await tenancyOf(tx, lettingId);
    if (tenancy.inventoryConfirmedAt) {
      throw new UserFacingError('The tenant has confirmed the inventory, so it can’t change.');
    }
    const [item] = await tx
      .insert(inventoryItems)
      .values({
        organisationId: member.organisationId,
        tenancyId: tenancy.id,
        ...parsed.data,
        photo: stored?.bytes ?? null,
        photoType: stored?.type ?? null,
      })
      .returning({ id: inventoryItems.id });
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'inventory.item_added',
      subject: { type: 'tenancy', id: tenancy.id },
      data: { tenancyId: tenancy.id, itemId: item!.id, withPhoto: stored !== null },
    });
  });
  return { ok: true };
}

/** R25: an item added by mistake, before the tenant confirms. */
export async function removeInventoryItem(
  member: Member,
  lettingId: string,
  itemId: string,
): Promise<void> {
  await withOrg(member.organisationId, async (tx) => {
    const tenancy = await tenancyOf(tx, lettingId);
    if (tenancy.inventoryConfirmedAt) {
      throw new UserFacingError('The tenant has confirmed the inventory, so it can’t change.');
    }
    await tx
      .delete(inventoryItems)
      .where(and(eq(inventoryItems.id, itemId), eq(inventoryItems.tenancyId, tenancy.id)));
  });
}

/** The inventory, without the photo bytes (they're served one by one). */
export async function inventoryOf(tx: Tx, tenancyId: string) {
  const rows = await tx
    .select({
      id: inventoryItems.id,
      room: inventoryItems.room,
      item: inventoryItems.item,
      condition: inventoryItems.condition,
      note: inventoryItems.note,
      photoType: inventoryItems.photoType,
    })
    .from(inventoryItems)
    .where(eq(inventoryItems.tenancyId, tenancyId))
    .orderBy(asc(inventoryItems.room), asc(inventoryItems.createdAt));
  return rows.map(({ photoType, ...row }) => ({ ...row, hasPhoto: photoType !== null }));
}

export async function inventoryFor(member: Member, lettingId: string) {
  return withOrg(member.organisationId, async (tx) => {
    const [tenancy] = await tx.select().from(tenancies).where(eq(tenancies.lettingId, lettingId));
    return tenancy ? inventoryOf(tx, tenancy.id) : [];
  });
}

/** R25: the tenant gets the inventory to look over and confirm. */
export async function shareInventory(member: Member, lettingId: string): Promise<void> {
  await withOrg(member.organisationId, async (tx) => {
    const tenancy = await tenancyOf(tx, lettingId);
    const items = await inventoryOf(tx, tenancy.id);
    if (items.length === 0) throw new UserFacingError('Add what’s in the home first.');
    const [row] = await tx
      .select({ tenant: applications, letting: lettings, organisation: organisations })
      .from(applications)
      .innerJoin(lettings, eq(lettings.id, applications.lettingId))
      .innerJoin(organisations, eq(organisations.id, applications.organisationId))
      .where(eq(applications.id, tenancy.applicationId));
    await tx
      .update(tenancies)
      .set({ inventorySharedAt: new Date() })
      .where(eq(tenancies.id, tenancy.id));
    const token = await createAccessLink(tx, {
      organisationId: member.organisationId,
      purpose: 'renter',
      subjectId: tenancy.applicationId,
    });
    await queueMessage(tx, {
      organisationId: member.organisationId,
      lettingId,
      applicationId: tenancy.applicationId,
      kind: 'inventory_shared',
      author: 'template',
      templateKey: INVENTORY_SHARED_TEMPLATE,
      toAddress: row!.tenant.email,
      ...inventorySharedEmail({
        tenantName: row!.tenant.fullName,
        operatorName: row!.organisation.name,
        address: row!.letting.addressLine1,
        pageUrl: `${env().APP_URL}/r/${token}`,
      }),
    });
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'inventory.shared',
      subject: { type: 'tenancy', id: tenancy.id },
      data: { tenancyId: tenancy.id, items: items.length },
    });
  });
}

/** R25: the tenant confirms the inventory is a fair record. */
export async function confirmInventory(token: string): Promise<boolean> {
  const link = await resolveAccessLink(token, 'renter');
  if (!link) return false;
  return withOrg(link.organisationId, async (tx) => {
    const [tenancy] = await tx
      .select()
      .from(tenancies)
      .where(eq(tenancies.applicationId, link.subjectId));
    if (!tenancy?.inventorySharedAt) return false;
    if (tenancy.inventoryConfirmedAt) return true;
    await tx
      .update(tenancies)
      .set({ inventoryConfirmedAt: new Date() })
      .where(eq(tenancies.id, tenancy.id));
    await recordEvent(tx, {
      organisationId: link.organisationId,
      lettingId: tenancy.lettingId,
      actor: { type: 'renter', applicationId: link.subjectId },
      type: 'inventory.confirmed',
      subject: { type: 'tenancy', id: tenancy.id },
      data: { tenancyId: tenancy.id },
    });
    return true;
  });
}

/** A photo, for the operator. */
export async function photoForOperator(member: Member, lettingId: string, itemId: string) {
  return withOrg(member.organisationId, async (tx) => {
    const [row] = await tx
      .select({ photo: inventoryItems.photo, type: inventoryItems.photoType })
      .from(inventoryItems)
      .innerJoin(tenancies, eq(tenancies.id, inventoryItems.tenancyId))
      .where(and(eq(inventoryItems.id, itemId), eq(tenancies.lettingId, lettingId)));
    return row?.photo && row.type ? { bytes: row.photo, type: row.type } : null;
  });
}

/** A photo, for the tenant, once the inventory has been shared with them. */
export async function photoForTenant(token: string, itemId: string) {
  const link = await resolveAccessLink(token, 'renter');
  if (!link) return null;
  return withOrg(link.organisationId, async (tx) => {
    const [row] = await tx
      .select({
        photo: inventoryItems.photo,
        type: inventoryItems.photoType,
        shared: tenancies.inventorySharedAt,
      })
      .from(inventoryItems)
      .innerJoin(tenancies, eq(tenancies.id, inventoryItems.tenancyId))
      .where(and(eq(inventoryItems.id, itemId), eq(tenancies.applicationId, link.subjectId)));
    return row?.photo && row.type && row.shared ? { bytes: row.photo, type: row.type } : null;
  });
}
