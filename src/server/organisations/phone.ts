import { eq } from 'drizzle-orm';
import { type Tx, withOrg } from '@/db/client';
import { organisations } from '@/db/schema';
import { tidyPhone } from '@/domain/organisations/phone';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { recordEvent } from '@/server/record/events';

/**
 * Q43: the number renters can call, kept on the organisation, where every renter page's "Talk
 * to a person" and the payment page read it (`listerColumns`). The event says only that a
 * number was given or removed: a landlord's own number is personal data (rule 8).
 */
export async function setListerPhoneIn(
  tx: Tx,
  member: Member,
  phone: string | null,
): Promise<void> {
  const tidy = phone === null ? null : tidyPhone(phone);
  if (phone !== null && !tidy) {
    throw new UserFacingError('Enter a phone number, like 01 234 5678, or leave it blank', 'phone');
  }
  const [organisation] = await tx
    .select({ phone: organisations.phone })
    .from(organisations)
    .where(eq(organisations.id, member.organisationId));
  if (!organisation) throw new Error('The organisation is gone');
  if (organisation.phone === tidy) return;
  await tx
    .update(organisations)
    .set({ phone: tidy })
    .where(eq(organisations.id, member.organisationId));
  await recordEvent(tx, {
    organisationId: member.organisationId,
    actor: { type: 'person', userId: member.userId },
    type: 'organisation.phone_set',
    data: { given: tidy !== null },
  });
}

/** Sets, changes or (with null) removes the number renters can call. */
export async function setListerPhone(member: Member, phone: string | null): Promise<void> {
  await withOrg(member.organisationId, (tx) => setListerPhoneIn(tx, member, phone));
}
