import { APIError, getSessionFromCtx } from 'better-auth/api';
import { passwordBreachCheck } from '@/adapters/password-breach';
import {
  passwordMessages,
  passwordProblem,
  type PasswordProblem,
} from '@/domain/auth/password-rules';
import { PASSWORD_CHECKS } from '@/domain/auth/limits';
import type { HookContext } from './hook-context';
import { limitFromAddress } from './limits';

/**
 * AU1, AU12: every call that sets a password goes through here first, as a hook: creating an
 * account, resetting, changing, or adding a password. One place for the rules
 * (src/domain/auth/password-rules) and the breached-password check.
 *
 * It runs before the step's own limit, so a password that's refused doesn't use up someone's
 * tries at signing up or their code. The breach lookups have a limit of their own.
 */
const passwordField: Record<string, 'password' | 'newPassword'> = {
  '/sign-up/email': 'password',
  '/email-otp/reset-password': 'password',
  '/reset-password': 'newPassword',
  '/change-password': 'newPassword',
  '/set-password': 'newPassword',
};

const refused = (problem: PasswordProblem) =>
  new APIError('BAD_REQUEST', {
    code: `PASSWORD_${problem.toUpperCase()}`,
    message: passwordMessages[problem],
  });

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
  const problem = passwordProblem(password, email);
  if (problem) throw refused(problem);
  await limitFromAddress('password_check', ctx.headers ?? ctx.request?.headers, PASSWORD_CHECKS);
  if (await passwordBreachCheck().isBreached(password)) throw refused('breached');
}

/** The problem with a new password, if that's why Better Auth refused a call. */
export function passwordRefusal(error: unknown): PasswordProblem | null {
  const code = (error as { body?: { code?: unknown } } | null)?.body?.code;
  if (typeof code !== 'string' || !code.startsWith('PASSWORD_')) return null;
  const problem = code.slice('PASSWORD_'.length).toLowerCase();
  return problem in passwordMessages ? (problem as PasswordProblem) : null;
}
