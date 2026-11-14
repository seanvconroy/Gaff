import { APIError, getSessionFromCtx } from 'better-auth/api';
import { signedInRecently } from '@/domain/auth/recent-sign-in';
import type { HookContext } from './hook-context';

/**
 * AU7: changing how you sign in needs a sign-in in the last hour
 * (src/domain/auth/recent-sign-in). Better Auth asks for that itself before adding a passkey
 * or disconnecting Google or Apple; this covers the routes it doesn't: connecting a provider
 * and removing a passkey. Adding a first password has no route, so ./flows checks that itself.
 */
const changes = new Set(['/link-social', '/passkey/delete-passkey']);

export const RECENT_SIGN_IN_NEEDED = 'RECENT_SIGN_IN_NEEDED';

export async function requireRecentForChanges(ctx: HookContext): Promise<void> {
  if (!changes.has(ctx.path ?? '')) return;
  const session = await getSessionFromCtx(ctx).catch(() => null);
  // Signed out: the call says so itself.
  if (!session) return;
  if (!signedInRecently(new Date(session.session.createdAt), new Date())) {
    throw new APIError('FORBIDDEN', {
      code: RECENT_SIGN_IN_NEEDED,
      message: 'Sign in again to change how you sign in.',
    });
  }
}

/** Whether Better Auth refused a call because the sign-in wasn't recent (its own check or ours). */
export function needsRecentSignIn(error: unknown): boolean {
  const code = (error as { body?: { code?: unknown } } | null)?.body?.code;
  return code === RECENT_SIGN_IN_NEEDED || code === 'SESSION_NOT_FRESH';
}
