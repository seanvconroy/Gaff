import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { sendsRealEmail } from '@/adapters/email';
import { codeCopy } from '@/copy/sign-in';
import { secondsUntilResend } from '@/domain/auth/codes';
import { showMobile } from '@/domain/auth/mobile';
import { signInPath } from '@/domain/auth/next-path';
import { env } from '@/lib/env';
import type { WaitingCode } from '@/server/auth/codes';
import { mobileSignIn } from '@/server/auth/mobile';
import { currentSignInCode, mobileWaitingForEmail } from '@/server/auth/sign-in';
import { CodeScreen } from './CodeScreen';

export const metadata: Metadata = { title: codeCopy.title };
export const dynamic = 'force-dynamic';

/** Where the code went, in words: by text, to a provider's address, or to an email address. */
function leadFor(waiting: WaitingCode): string {
  if (waiting.channel === 'sms') return codeCopy.leadText(showMobile(waiting.subject));
  const provider = waiting.joining?.provider?.id;
  if (provider) return codeCopy.leadProvider(provider, waiting.subject);
  return codeCopy.lead(waiting.subject);
}

/** The way back from the code screen, by where the person came from. */
function wayBack(waiting: WaitingCode): { href: string; label: string } {
  if (waiting.channel === 'sms') {
    return { href: signInPath(waiting.nextPath), label: codeCopy.differentNumber };
  }
  // UX-SI-14: the email that goes with a number: back to "What's your email?".
  if (waiting.joining?.mobile) return { href: '/sign-in/email', label: codeCopy.different };
  return { href: signInPath(waiting.nextPath), label: codeCopy.different };
}

/** Locally, where the message can be read. Where it's really sent, it's in their own inbox. */
function devOutboxWords(waiting: WaitingCode): string | null {
  if (!env().DEV_TOOLS) return null;
  if (waiting.channel === 'sms') {
    return mobileSignIn() === 'stand_in' ? codeCopy.devOutboxText : null;
  }
  return sendsRealEmail() ? null : codeCopy.devOutbox;
}

/**
 * UX-SI-2, UX-SI-13: the code screen. Which code it's waiting on comes from this browser's
 * cookie, never from the address bar: an email address or a mobile number is never in a URL
 * (rule 8).
 */
export default async function SignInCodePage() {
  const waiting = await currentSignInCode();
  if (!waiting) redirect('/sign-in');
  // UX-SI-14: the text's code was right, and the number still needs its email.
  if (waiting.channel === 'sms' && waiting.usedAt) {
    redirect((await mobileWaitingForEmail()) ? '/sign-in/email' : '/sign-in');
  }
  const now = new Date();
  return (
    <CodeScreen
      lead={leadFor(waiting)}
      byText={waiting.channel === 'sms'}
      initial={{
        status: waiting.open ? 'waiting' : 'expired',
        resendIn: secondsUntilResend(waiting.sentAt, now),
        stamp: now.getTime(),
      }}
      different={wayBack(waiting)}
      devOutbox={devOutboxWords(waiting)}
    />
  );
}
