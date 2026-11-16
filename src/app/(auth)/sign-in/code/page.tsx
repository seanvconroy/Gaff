import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { codeCopy } from '@/copy/sign-in';
import { secondsUntilResend } from '@/domain/auth/codes';
import { signInPath } from '@/domain/auth/next-path';
import { env } from '@/lib/env';
import { currentSignInCode } from '@/server/auth/sign-in';
import { CodeScreen } from './CodeScreen';

export const metadata: Metadata = { title: codeCopy.title };
export const dynamic = 'force-dynamic';

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
      email={waiting.subject}
      initial={{
        status: waiting.open ? 'waiting' : 'expired',
        resendIn: secondsUntilResend(waiting.sentAt, now),
        stamp: now.getTime(),
      }}
      differentEmailHref={signInPath(waiting.nextPath)}
      devOutbox={env().DEV_TOOLS}
    />
  );
}
