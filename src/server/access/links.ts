import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { withSystem, type Tx } from '@/db/client';
import { accessLinks } from '@/db/schema';

/** Renter links last long enough for any letting; they're revoked when it closes (R26). */
const RENTER_LINK_DAYS = 120;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Creates a private link (ADR-0013): a 256-bit random token, of which only a hash is kept.
 * Returns the token, to be put in the URL. Runs in the caller's transaction.
 */
export async function createAccessLink(
  tx: Tx,
  input: { organisationId: string; purpose: 'renter' | 'landlord'; subjectId: string },
): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await tx.insert(accessLinks).values({
    organisationId: input.organisationId,
    purpose: input.purpose,
    subjectId: input.subjectId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + RENTER_LINK_DAYS * 24 * 60 * 60 * 1000),
  });
  return token;
}

/**
 * Finds the organisation and subject behind a private link, if it's valid. The visitor has
 * no account, so this one lookup runs across organisations; everything after it is scoped.
 */
export async function resolveAccessLink(
  token: string,
  purpose: 'renter' | 'landlord',
): Promise<{ organisationId: string; subjectId: string } | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return withSystem(async (tx) => {
    const [link] = await tx
      .update(accessLinks)
      .set({ lastUsedAt: new Date() })
      .where(
        and(
          eq(accessLinks.tokenHash, hashToken(token)),
          eq(accessLinks.purpose, purpose),
          isNull(accessLinks.revokedAt),
          gt(accessLinks.expiresAt, new Date()),
        ),
      )
      .returning({ organisationId: accessLinks.organisationId, subjectId: accessLinks.subjectId });
    return link ?? null;
  });
}
