import { APIError, getSessionFromCtx } from 'better-auth/api';
import { db } from '@/db/client';
import { justSignedIn } from '@/domain/auth/passkeys';
import { findConfirmation, spendConfirmation } from './confirm';
import { cookieNames } from './cookies';
import type { HookContext } from './limits';

/** The code a passkey add is refused with when "Confirm it's you" is needed first. */
export const CONFIRM_FIRST = 'CONFIRM_FIRST';

const ADDING = new Set(['/passkey/generate-register-options', '/passkey/verify-registration']);

/**
 * BA-8 (AU6, UX-SI-10): adding a passkey is a change to how someone signs in. Straight after a
 * sign-in it needs nothing more: that's the passkey offer (UX-SI-4), and the person has just
 * proved it's them. Any later, from "How you sign in", it needs a "Confirm it's you" for
 * `change_sign_in` in this browser, which the device's answer spends. Without one, the plugin's
 * routes refuse before anything is made.
 */
export async function guardPasskeyAdd(ctx: HookContext, now = new Date()): Promise<void> {
  if (!ADDING.has(ctx.path ?? '')) return;
  const session = await getSessionFromCtx(ctx).catch(() => null);
  // Signed out: the plugin refuses on its own.
  if (!session) return;
  if (justSignedIn(new Date(session.session.createdAt), now)) return;
  const confirmation = await findConfirmation(
    session.user.id,
    'change_sign_in',
    ctx.getCookie(cookieNames.confirmed),
    now,
  );
  const refuse = () =>
    new APIError('FORBIDDEN', { code: CONFIRM_FIRST, message: 'Confirm it’s you first.' });
  if (!confirmation) throw refuse();
  if (ctx.path !== '/passkey/verify-registration') return;
  try {
    await db().transaction((tx) =>
      spendConfirmation(tx, confirmation, 'change_sign_in', session.user.id, now),
    );
  } catch {
    throw refuse();
  }
}
