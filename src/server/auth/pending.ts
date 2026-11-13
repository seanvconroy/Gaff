import { cookies } from 'next/headers';
import { z } from 'zod';
import { env } from '@/lib/env';
import { openSigned, signValue } from '@/lib/signed-value';

/**
 * AU2, AU3, AU5: what carries a sign-in step from one page to the next, such as "a code went to
 * this address", so nobody types their email twice (WCAG 3.3.7) and it never goes in a URL. A
 * signed, HTTP-only cookie that lasts 15 minutes.
 *
 * For a new password account it also names the account that sign-up made, so only the browser
 * that started can confirm it (ADR-0028: someone else's sign-up for the same email can't be
 * confirmed by mistake).
 */

const COOKIE = 'gaff_pending';
const MINUTES = 15;

const pendingSchema = z.object({
  purpose: z.enum(['sign_in', 'confirm', 'reset']),
  email: z.email(),
  userId: z.string().optional(),
  next: z.string(),
  sentAt: z.number(),
});

export type Pending = z.infer<typeof pendingSchema>;

export async function setPending(
  pending: Omit<Pending, 'sentAt'>,
  now = new Date(),
): Promise<void> {
  const config = env();
  const expiresAt = new Date(now.getTime() + MINUTES * 60_000);
  (await cookies()).set(
    COOKIE,
    signValue({ ...pending, sentAt: now.getTime() }, config.AUTH_SECRET, expiresAt),
    {
      httpOnly: true,
      secure: config.APP_URL.startsWith('https://'),
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    },
  );
}

/** The step in progress, if it's the one this page is for. */
export async function readPending(purpose: Pending['purpose']): Promise<Pending | null> {
  const value = (await cookies()).get(COOKIE)?.value;
  const parsed = pendingSchema.safeParse(openSigned(value, env().AUTH_SECRET));
  return parsed.success && parsed.data.purpose === purpose ? parsed.data : null;
}

export async function clearPending(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
