import type { SocialProvider } from './email-authority';

/**
 * AU3: what to say when someone comes back from Google or Apple without being signed in. The
 * library and the providers send machine codes in the address; these are the plain words.
 */

export type SignInProblem =
  'cancelled' | 'cannot_link' | 'code_first' | 'restart' | 'taken' | 'slow_down' | 'failed';

const problems: Record<string, SignInProblem> = {
  access_denied: 'cancelled',
  user_cancelled_authorize: 'cancelled',
  account_not_linked: 'cannot_link',
  unable_to_link_account: 'cannot_link',
  email_not_verified: 'cannot_link',
  email_does_not_match: 'cannot_link',
  confirm_email_first: 'code_first',
  state_mismatch: 'restart',
  state_not_found: 'restart',
  please_restart_the_process: 'restart',
  invalid_callback_request: 'restart',
  no_code: 'restart',
  account_already_linked_to_different_user: 'taken',
  slow_down: 'slow_down',
};

/** The problem behind an `?error=` code. Null when there's no code; anything unknown failed. */
export function problemForCode(code: string | undefined): SignInProblem | null {
  if (!code) return null;
  return problems[code] ?? 'failed';
}

const names: Record<SocialProvider, string> = { google: 'Google', apple: 'Apple' };

export function providerName(provider: unknown): string | null {
  return provider === 'google' || provider === 'apple' ? names[provider] : null;
}

export function problemWords(problem: SignInProblem, provider: SocialProvider | undefined): string {
  const name = provider ? names[provider] : null;
  switch (problem) {
    case 'cancelled':
      return name ? `Signing in with ${name} was cancelled.` : 'Signing in was cancelled.';
    case 'cannot_link':
      return `You already have a Gaff account for this email. Sign in another way, then connect ${name ?? 'it'} from “How you sign in”.`;
    case 'code_first':
      return `${name ?? 'They'} can’t confirm that email address is still yours. This first time, use “Email me a code instead”. Then connect ${name ?? 'it'} from “How you sign in”.`;
    case 'restart':
      return 'That took too long, or opened in another browser. Try again.';
    case 'taken':
      return `That ${name ?? ''} account is already used by another Gaff account.`.replace(
        '  ',
        ' ',
      );
    case 'slow_down':
      return 'That’s a lot of tries. Wait a minute, then try again.';
    case 'failed':
      return name
        ? `Something went wrong with ${name}. Try again, or use your email.`
        : 'Something went wrong signing you in. Try again, or use your email.';
  }
}

/**
 * AU7: the same problems, coming back to "How you sign in" after trying to connect Google or
 * Apple to the account that's signed in. Nothing has changed when any of these shows.
 */
export function connectProblemWords(
  problem: SignInProblem,
  provider: SocialProvider | undefined,
): string {
  const name = provider ? names[provider] : null;
  switch (problem) {
    case 'cancelled':
      return name
        ? `Connecting ${name} was cancelled. Nothing has changed.`
        : 'That was cancelled. Nothing has changed.';
    case 'taken':
      return name
        ? `That ${name} account is already used by another Gaff account. To use it here, sign in to that account and disconnect it first.`
        : 'That account is already used by another Gaff account. To use it here, sign in to that account and disconnect it first.';
    case 'restart':
      return 'That took too long, or opened in another browser. Nothing has changed. Try again.';
    case 'slow_down':
      return 'That’s a lot of tries. Wait a minute, then try again.';
    default:
      return name
        ? `Something went wrong connecting ${name}. Nothing has changed. Try again.`
        : 'Something went wrong. Nothing has changed. Try again.';
  }
}
