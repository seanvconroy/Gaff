import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { sendsRealEmail } from '@/adapters/email';
import { codeCopy } from '@/copy/sign-in';
import { secondsUntilResend } from '@/domain/auth/codes';
import { signInPath } from '@/domain/auth/next-path';
import { env } from '@/lib/env';
import type { WaitingCode } from '@/server/auth/codes';
import { currentSignInCode } from '@/server/auth/sign-in';
import { CodeScreen } from './CodeScreen';

export const metadata: Metadata = { title: codeCopy.title };
export const dynamic = 'force-dynamic';

/** Where the code went, in words: to a provider's address (UX-SI-15), or to an email address. */
function leadFor(waiting: WaitingCode): string {
  if (waiting.joining?.provider) return codeCopy.leadProvider(waiting.subject);
  return codeCopy.lead(waiting.subject);
}

/**
 * UX-SI-2: the code screen. Which code it's waiting on comes from this browser's cookie, never
 * from the address bar: an email address is never in a URL (rule 8).
 */
export default async function SignInCodePage() {
  const waiting = await currentSignInCode();
  if (!waiting) redirect('/sign-in');
  const now = new Date();
  return (
    <CodeScreen
      lead={leadFor(waiting)}
      initial={{
        status: waiting.open ? 'waiting' : 'expired',
        resendIn: secondsUntilResend(waiting.sentAt, now),
        stamp: now.getTime(),
      }}
      differentEmailHref={signInPath(waiting.nextPath)}
      // Where email is really sent (the test copy), the code is in the person's own inbox.
      devOutbox={env().DEV_TOOLS && !sendsRealEmail()}
    />
  );
}
