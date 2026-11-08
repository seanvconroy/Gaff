import { createHmac, randomInt } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { smsSender } from '@/adapters/sms';
import { mobileCodeSms } from '@/copy/verification';
import { withRenter } from '@/db/client';
import { phoneConfirmations } from '@/db/schema';
import {
  canSendCode,
  checkCode,
  CODE_TTL_MS,
  maskMobile,
  normaliseMobile,
  type CodeCheck,
} from '@/domain/verification/mobile';
import { env } from '@/lib/env';
import { recordPlatformEvent } from '@/server/record/platform-events';

type SendProblem = 'invalid' | 'too_soon' | 'too_many' | 'not_sent';

function hashCode(userId: string, code: string): string {
  return createHmac('sha256', env().AUTH_SECRET).update(`${userId}:${code}`).digest('base64url');
}

/**
 * M3: sends a 6-digit code by SMS to confirm a mobile. The code is stored hashed. The test copy
 * doesn't send texts yet (open question N3), so there the code comes back to show on screen.
 */
export async function sendMobileCode(
  userId: string,
  input: string,
  now = new Date(),
): Promise<
  { ok: true; masked: string; testCopyCode?: string } | { ok: false; problem: SendProblem }
> {
  const phone = normaliseMobile(input);
  if (!phone) return { ok: false, problem: 'invalid' };
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');

  const decision = await withRenter(userId, async (tx) => {
    const [row] = await tx
      .select()
      .from(phoneConfirmations)
      .where(eq(phoneConfirmations.userId, userId));
    const allowed = canSendCode(
      { lastSentAt: row?.lastSentAt ?? null, sendsToday: row?.sendsToday ?? 0 },
      now,
    );
    if (!allowed.ok) return allowed;
    const sameDay = row?.lastSentAt?.toDateString() === now.toDateString();
    const values = {
      phone,
      codeHash: hashCode(userId, code),
      codeExpiresAt: new Date(now.getTime() + CODE_TTL_MS),
      attempts: 0,
      sendsToday: sameDay ? (row?.sendsToday ?? 0) + 1 : 1,
      lastSentAt: now,
    };
    if (row) {
      await tx.update(phoneConfirmations).set(values).where(eq(phoneConfirmations.userId, userId));
    } else {
      await tx.insert(phoneConfirmations).values({ userId, ...values });
    }
    await recordPlatformEvent(tx, {
      type: 'mobile.code_sent',
      actor: { type: 'person', userId },
      data: {},
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

/** M3: checks the code. Five wrong tries lock it until a new code is sent. */
export async function confirmMobileCode(
  userId: string,
  code: string,
  now = new Date(),
): Promise<{ ok: true } | { ok: false; problem: Exclude<CodeCheck, 'ok'> }> {
  const given = hashCode(userId, code.replace(/\s/g, ''));
  return withRenter(userId, async (tx) => {
    const [row] = await tx
      .select()
      .from(phoneConfirmations)
      .where(eq(phoneConfirmations.userId, userId));
    const result = checkCode(
      {
        codeHash: row?.codeHash ?? null,
        codeExpiresAt: row?.codeExpiresAt ?? null,
        attempts: row?.attempts ?? 0,
      },
      given,
      now,
    );
    if (result === 'wrong') {
      await tx
        .update(phoneConfirmations)
        .set({ attempts: (row?.attempts ?? 0) + 1 })
        .where(eq(phoneConfirmations.userId, userId));
    }
    if (result !== 'ok') return { ok: false, problem: result };
    await tx
      .update(phoneConfirmations)
      .set({
        confirmedPhone: row!.phone,
        confirmedAt: now,
        codeHash: null,
        codeExpiresAt: null,
        attempts: 0,
      })
      .where(eq(phoneConfirmations.userId, userId));
    await recordPlatformEvent(tx, {
      type: 'mobile.confirmed',
      actor: { type: 'person', userId },
      data: {},
    });
    return { ok: true };
  });
}

/** The person's confirmed mobile, or null. */
export async function confirmedMobile(userId: string): Promise<string | null> {
  const [row] = await withRenter(userId, (tx) =>
    tx
      .select({ phone: phoneConfirmations.confirmedPhone })
      .from(phoneConfirmations)
      .where(eq(phoneConfirmations.userId, userId)),
  );
  return row?.phone ?? null;
}
