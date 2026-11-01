import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withOrg } from '@/db/client';
import { inventoryItems, messages, tenancies } from '@/db/schema';
import { UserFacingError } from '@/server/errors';
import {
  addInventoryItem,
  confirmInventory,
  inventoryFor,
  photoForTenant,
  removeInventoryItem,
  saveChecklist,
  shareInventory,
} from '@/server/tenancy/movein';
import { aLetHome, createTestMember } from './helpers';

/** A tiny synthetic JPEG whose Exif segment carries made-up GPS text. */
const seg = (marker: number, text: string) => {
  const body = Buffer.from(text, 'latin1');
  return Buffer.concat([Buffer.from([0xff, marker, 0, body.length + 2]), body]);
};
const jpegWithLocation = Buffer.concat([
  Buffer.from([0xff, 0xd8]),
  seg(0xe0, 'JFIF\0'),
  seg(0xe1, 'Exif\0\0GPSLatitude 53.3242 GPSLongitude -6.2526'),
  Buffer.from([0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0x33, 0xff, 0xd9]),
]);
const item = { room: 'Kitchen', item: 'Fridge', condition: 'good', note: 'Freezer drawer cracked' };

describe('R25: moving in', () => {
  it('records the checklist; handing over the keys is moving in', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLetHome(member);
    await saveChecklist(member, lettingId, { keys: 'yes', alarms: 'yes', electricity: '012345' });
    const [tenancy] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(tenancies).where(eq(tenancies.lettingId, lettingId)),
    );
    expect(tenancy!.moveInChecklist).toMatchObject({ keys: 'yes', electricity: '012345' });
    expect(tenancy!.moveInCompletedAt).toBeInstanceOf(Date);
  });

  it('keeps only real photos, under 4 MB, with location and camera details removed', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLetHome(member);
    expect(await addInventoryItem(member, lettingId, { ...item, room: '' }, null)).toMatchObject({
      ok: false,
      errors: { room: 'Enter the room.' },
    });
    expect(
      await addInventoryItem(member, lettingId, item, Buffer.from('<svg onload=alert(1)>')),
    ).toEqual({
      ok: false,
      errors: { photo: 'That isn’t a photo Gaff can use. Try a JPEG, PNG or WebP.' },
    });
    expect(
      await addInventoryItem(member, lettingId, item, Buffer.alloc(4 * 1024 * 1024 + 1, 0xff)),
    ).toMatchObject({ ok: false, errors: { photo: 'That photo is too big. Try one under 4 MB.' } });
    expect(await addInventoryItem(member, lettingId, item, jpegWithLocation)).toEqual({ ok: true });
    const [stored] = await withOrg(member.organisationId, (tx) => tx.select().from(inventoryItems));
    expect(stored!.photoType).toBe('image/jpeg');
    expect(stored!.photo!.toString('latin1')).not.toContain('GPS');
    expect(stored!.photo!.toString('latin1')).toContain('JFIF');
  });

  it('is shared with the tenant, who sees the photos and confirms it; then it can’t change', async () => {
    const member = await createTestMember();
    const { lettingId, tenantId, tenantToken } = await aLetHome(member);
    await expect(shareInventory(member, lettingId)).rejects.toThrow(
      'Add what’s in the home first.',
    );
    await addInventoryItem(member, lettingId, item, jpegWithLocation);
    await addInventoryItem(member, lettingId, { ...item, item: 'Kettle' }, null);
    const [first, second] = await inventoryFor(member, lettingId);
    await removeInventoryItem(member, lettingId, second!.id);
    expect(await photoForTenant(tenantToken, first!.id)).toBeNull();
    await shareInventory(member, lettingId);
    const [email] = await withOrg(member.organisationId, (tx) =>
      tx
        .select()
        .from(messages)
        .where(and(eq(messages.applicationId, tenantId), eq(messages.kind, 'inventory_shared'))),
    );
    expect(email!.subject).toBe('12 Ranelagh Road: your move-in inventory');
    expect((await photoForTenant(tenantToken, first!.id))!.type).toBe('image/jpeg');
    expect(await confirmInventory(tenantToken)).toBe(true);
    await expect(addInventoryItem(member, lettingId, item, null)).rejects.toThrow(UserFacingError);
  });
});
