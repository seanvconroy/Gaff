import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { withSystem } from '@/db/client';
import { organisationInvites, organisations } from '@/db/schema';
import { env } from '@/lib/env';

/**
 * UX-AG-11: the link in an invite email, `/join/{token}`. It opens sign-in titled "Join
 * {agency}", with the invited address filled in.
 *
 * The token is the invite's ID and a signature over the ID and when it was last sent, so nothing
 * secret is stored, and "Send again" makes the earlier link stop working. It holds no address.
 * The link only fills in sign-in: joining still needs the invited address, verified, as sign-in
 * finishes (src/server/accounts/invites.ts).
 */
export const JOIN_PATH = '/join';

function signature(inviteId: string, sentAt: Date): Buffer {
  return createHmac('sha256', env().AUTH_SECRET)
    .update(`gaff:invite:${inviteId}:${sentAt.getTime()}`)
    .digest();
}

export function inviteToken(invite: { id: string; sentAt: Date }): string {
  return `${invite.id}.${signature(invite.id, invite.sentAt).toString('base64url')}`;
}

export function invitePath(invite: { id: string; sentAt: Date }): string {
  return `${JOIN_PATH}/${inviteToken(invite)}`;
}

const TOKEN = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/i;

/** The token from a `/join/{token}` path, if that's what the path is. */
export function inviteTokenIn(path: string | null | undefined): string | null {
  const match = /^\/join\/([^/?#]+)$/.exec(path ?? '');
  return match && TOKEN.test(match[1]!) ? match[1]! : null;
}

export interface OpenInvite {
  inviteId: string;
  organisationId: string;
  organisationName: string;
  email: string;
}

/**
 * The invite a token stands for, if it still stands: not accepted, cancelled, sent again or
 * expired. It looks across organisations, as nobody knows yet which one; it reads one invite,
 * by its ID.
 */
export async function openInvite(token: string, now = new Date()): Promise<OpenInvite | null> {
  const match = TOKEN.exec(token);
  if (!match) return null;
  const [, inviteId, given] = match;
  const [invite] = await withSystem((tx) =>
    tx
      .select({
        inviteId: organisationInvites.id,
        organisationId: organisationInvites.organisationId,
        organisationName: organisations.name,
        email: organisationInvites.email,
        sentAt: organisationInvites.sentAt,
      })
      .from(organisationInvites)
      .innerJoin(organisations, eq(organisations.id, organisationInvites.organisationId))
      .where(and(eq(organisationInvites.id, inviteId!), gt(organisationInvites.expiresAt, now))),
  );
  if (!invite) return null;
  const expected = signature(invite.inviteId, invite.sentAt);
  const actual = Buffer.from(given!, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  const { sentAt: _sentAt, ...open } = invite;
  return open;
}
