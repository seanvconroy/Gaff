import { createHmac, randomInt } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { smsSender } from '@/adapters/sms';
import { mobileCodeSms } from '@/copy/verification';
import { withOrg } from '@/db/client';
import { applications } from '@/db/schema';
import {
  canSendCode,
  checkCode,
  CODE_TTL_MS,
  maskMobile,
  normaliseMobile,
  type CodeCheck,
} from '@/domain/verification/mobile';
import { env } from '@/lib/env';
import { resolveAccessLink } from '@/server/access/links';
import { recordEvent } from '@/server/record/events';

/** Only someone who can book a viewing (or has a place offered from the waiting list). */
const CAN_BOOK = ['invited', 'booked', 'waitlisted'];

function hashCode(applicationId: string, code: string): string {
  return createHmac('sha256', env().AUTH_SECRET)
    .update(`booking:${applicationId}:${code}`)
    .digest('base64url');
}

export type BookingCodeProblem = 'link' | 'invalid' | 'too_soon' | 'too_many' | 'not_sent';

/**
 * P16: before a renter books a viewing, they confirm their mobile with a 6-digit text code. The
 * code is keyed to the application, so renters from Daft and MyHome need no account. As in M3,
 * it's stored hashed, lasts 10 minutes and allows 5 tries, with at most 5 texts a day. The test
 * copy doesn't send texts yet (N3), so there the code comes back to show on screen.
 */
export async function sendBookingCode(
  token: string,
  input: string,
  now = new Date(),
): Promise<
  { ok: true; masked: string; testCopyCode?: string } | { ok: false; problem: BookingCodeProblem }
> {
  const link = await resolveAccessLink(token, 'renter');
  if (!link) return { ok: false, problem: 'link' };
  const phone = normaliseMobile(input);
  if (!phone) return { ok: false, problem: 'invalid' };
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');

  const decision = await withOrg(link.organisationId, async (tx) => {
    const [row] = await tx
      .select({
        id: applications.id,
        lettingId: applications.lettingId,
        status: applications.status,
        sentAt: applications.mobileCodeSentAt,
        sendsToday: applications.mobileCodesToday,
      })
      .from(applications)
      .where(eq(applications.id, link.subjectId))
      .for('update');
    if (!row || !CAN_BOOK.includes(row.status))
      return { ok: false as const, reason: 'link' as const };
    const allowed = canSendCode({ lastSentAt: row.sentAt, sendsToday: row.sendsToday }, now);
    if (!allowed.ok) return allowed;
    const sameDay = row.sentAt?.toDateString() === now.toDateString();
    await tx
      .update(applications)
      .set({
        mobilePending: phone,
        mobileCodeHash: hashCode(row.id, code),
        mobileCodeExpiresAt: new Date(now.getTime() + CODE_TTL_MS),
        mobileCodeAttempts: 0,
        mobileCodesToday: sameDay ? row.sendsToday + 1 : 1,
        mobileCodeSentAt: now,
      })
      .where(eq(applications.id, row.id));
    await recordEvent(tx, {
      organisationId: link.organisationId,
      lettingId: row.lettingId,
      actor: { type: 'renter', applicationId: row.id },
      type: 'booking.mobile_code_sent',
      subject: { type: 'application', id: row.id },
      data: { applicationId: row.id },
    });
    return { ok: true as const };
  });
  if (!decision.ok) return { ok: false, problem: decision.reason };

  try {
    await smsSender().send({ to: phone, body: mobileCodeSms(code) });
  } catch {
    return { ok: false, problem: 'not_sent' };
  }
  const config = env();
  const onScreen = config.GAFF_ENV === 'staging' && config.SMS_PROVIDER === 'fake';
  return { ok: true, masked: maskMobile(phone), ...(onScreen ? { testCopyCode: code } : {}) };
}

/**
 * P16, R13: checks the code. Once it matches, the number becomes the application's mobile, for
 * the 2-hour text reminder (changing Q12), and the code is cleared. Five wrong tries lock it
 * until a new code is sent.
 */
export async function confirmBookingCode(
  token: string,
  code: string,
  now = new Date(),
): Promise<{ ok: true } | { ok: false; problem: Exclude<CodeCheck, 'ok'> | 'link' }> {
  const link = await resolveAccessLink(token, 'renter');
  if (!link) return { ok: false, problem: 'link' };
  return withOrg(link.organisationId, async (tx) => {
    const [row] = await tx
      .select({
        id: applications.id,
        lettingId: applications.lettingId,
        pending: applications.mobilePending,
        codeHash: applications.mobileCodeHash,
        codeExpiresAt: applications.mobileCodeExpiresAt,
        attempts: applications.mobileCodeAttempts,
      })
      .from(applications)
      .where(eq(applications.id, link.subjectId))
      .for('update');
    if (!row) return { ok: false, problem: 'link' };
    const result = checkCode(row, hashCode(row.id, code.replace(/\s/g, '')), now);
    if (result === 'wrong') {
      await tx
        .update(applications)
        .set({ mobileCodeAttempts: row.attempts + 1 })
        .where(eq(applications.id, row.id));
    }
    if (result !== 'ok' || !row.pending) {
      return { ok: false, problem: result === 'ok' ? 'none' : result };
    }
    await tx
      .update(applications)
      .set({
        phone: row.pending,
        phoneE164: row.pending,
        mobileConfirmedAt: now,
        smsReminders: true,
        mobilePending: null,
        mobileCodeHash: null,
        mobileCodeExpiresAt: null,
        mobileCodeAttempts: 0,
      })
      .where(eq(applications.id, row.id));
    await recordEvent(tx, {
      organisationId: link.organisationId,
      lettingId: row.lettingId,
      actor: { type: 'renter', applicationId: row.id },
      type: 'booking.mobile_confirmed',
      subject: { type: 'application', id: row.id },
      data: { applicationId: row.id },
    });
    return { ok: true };
  });
}
