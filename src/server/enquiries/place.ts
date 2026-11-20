import { and, eq, or, sql } from 'drizzle-orm';
import type { Tx } from '@/db/client';
import { applications } from '@/db/schema';
import { normaliseEmail, normalisePhone } from '@/domain/enquiries/parse';
import { type EnquirySource, withSource } from '@/domain/enquiries/sources';

const REF_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

/** A short random reference for a renter's reply address (not guessable). */
export function newApplicationRef(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('');
}

export interface PlacedEnquiry {
  applicationId: string;
  /** The person had enquired about this home already: merged, not duplicated (R6, UX-AV-9). */
  existing: boolean;
}

/**
 * R6, UX-AV-9: one person, one enquiry per home. Finds this person's application to the letting
 * (by email, or by phone where one came with the enquiry) and adds this source to it, or starts
 * one. The same rule for an enquiry from Daft, from MyHome, or made on Gaff, so someone who did
 * both is one person in the letting. Runs in the caller's transaction, inside `withOrg()`.
 *
 * `at` is the enquiry's time. The earliest stands as the person's place in the order.
 */
export async function placeEnquiry(
  tx: Tx,
  input: {
    organisationId: string;
    lettingId: string;
    fullName: string;
    email: string;
    phone: string | null;
    source: EnquirySource;
    at: Date;
    /** A reference chosen ahead, for an enquiry whose first email has already gone (UX-AV-6). */
    ref?: string;
  },
): Promise<PlacedEnquiry> {
  const emailNormalised = normaliseEmail(input.email);
  const phoneE164 = normalisePhone(input.phone);
  const [existing] = await tx
    .select({ id: applications.id, sources: applications.sources })
    .from(applications)
    .where(
      and(
        eq(applications.lettingId, input.lettingId),
        or(
          eq(applications.emailNormalised, emailNormalised),
          phoneE164 ? eq(applications.phoneE164, phoneE164) : sql`false`,
        ),
      ),
    )
    .for('update');

  if (existing) {
    await tx
      .update(applications)
      .set({
        firstEnquiredAt: sql`least(${applications.firstEnquiredAt}, ${input.at})`,
        lastEnquiredAt: sql`greatest(${applications.lastEnquiredAt}, ${input.at})`,
        sources: withSource(existing.sources, input.source),
        phone: sql`coalesce(${applications.phone}, ${input.phone})`,
        phoneE164: sql`coalesce(${applications.phoneE164}, ${phoneE164})`,
      })
      .where(eq(applications.id, existing.id));
    return { applicationId: existing.id, existing: true };
  }
  const [created] = await tx
    .insert(applications)
    .values({
      organisationId: input.organisationId,
      lettingId: input.lettingId,
      ref: input.ref ?? newApplicationRef(),
      fullName: input.fullName,
      email: input.email,
      emailNormalised,
      phone: input.phone,
      phoneE164,
      sources: [input.source],
      firstEnquiredAt: input.at,
      lastEnquiredAt: input.at,
    })
    .returning({ id: applications.id });
  return { applicationId: created!.id, existing: false };
}
