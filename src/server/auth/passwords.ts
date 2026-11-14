import { APIError, getSessionFromCtx } from 'better-auth/api';
import { passwordBreachCheck } from '@/adapters/password-breach';
import { PASSWORD_CHECKS } from '@/domain/auth/limits';
import {
  passwordMessages,
  passwordProblem,
  type PasswordProblem,
} from '@/domain/auth/password-rules';
import type { HookContext } from './hook-context';
import { limitFromAddress, refusal } from './limits';

/**
 * AU1, AU12: what's wrong with a new password, if anything: the rules
 * (src/domain/auth/password-rules), then whether it has been seen in a data breach. The breach
 * lookups have a limit of their own, per network address.
 */
export async function newPasswordProblem(
  password: string,
  email: string,
  headers: Headers | undefined | null,
): Promise<PasswordProblem | 'slow_down' | null> {
  const problem = passwordProblem(password, email);
  if (problem) return problem;
  try {
    await limitFromAddress('password_check', headers, PASSWORD_CHECKS);
  } catch (error) {
    if (refusal(error)) return 'slow_down';
    throw error;
  }
  return (await passwordBreachCheck().isBreached(password)) ? 'breached' : null;
}

/**
 * Every call over a route that sets a password goes through here first, as a hook: creating an
 * account, resetting, or changing a password. It runs before the step's own limit, so a
 * password that's refused doesn't use up someone's tries at signing up or their code.
 *
 * Adding a first password has no route (only Gaff's own code can call it), so a hook can't see
 * it: ./flows checks that one itself.
 */
const passwordField: Record<string, 'password' | 'newPassword'> = {
  '/sign-up/email': 'password',
  '/email-otp/reset-password': 'password',
  '/reset-password': 'newPassword',
  '/change-password': 'newPassword',
};

export async function checkNewPassword(ctx: HookContext): Promise<void> {
  const field = passwordField[ctx.path ?? ''];
  if (!field) return;
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const password = body[field];
  if (typeof password !== 'string') return;
  const email =
    typeof body.email === 'string'
      ? body.email
      : ((await getSessionFromCtx(ctx).catch(() => null))?.user.email ?? '');
  const problem = await newPasswordProblem(password, email, ctx.headers ?? ctx.request?.headers);
  if (!problem) return;
  if (problem === 'slow_down') {
    throw new APIError('TOO_MANY_REQUESTS', {
      code: 'SLOW_DOWN',
      message: 'Too many tries. Wait a minute, then try again.',
    });
  }
  throw new APIError('BAD_REQUEST', {
    code: `PASSWORD_${problem.toUpperCase()}`,
    message: passwordMessages[problem],
  });
}

/** The problem with a new password, if that's why Better Auth refused a call. */
export function passwordRefusal(error: unknown): PasswordProblem | null {
  const code = (error as { body?: { code?: unknown } } | null)?.body?.code;
  if (typeof code !== 'string' || !code.startsWith('PASSWORD_')) return null;
  const problem = code.slice('PASSWORD_'.length).toLowerCase();
  return problem in passwordMessages ? (problem as PasswordProblem) : null;
}
