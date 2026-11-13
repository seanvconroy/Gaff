import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { sendsRealEmail } from '@/adapters/email';
import { CODE_MINUTES } from '@/domain/auth/codes';
import { env } from '@/lib/env';
import { readPending } from '@/server/auth/pending';
import { PageHeader, Stack } from '@/ui/Layout';
import { CodeForm } from '../../CodeForm';
import { checkSignInCode, sendNewSignInCode } from '../actions';

export const metadata: Metadata = { title: 'Enter your code' };
export const dynamic = 'force-dynamic';

/** AU3: the 6-digit code from the sign-in email. It says the same for any address. */
export default async function SignInCodePage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const pending = await readPending('sign_in');
  if (!pending) redirect('/sign-in');
  const { sent } = await searchParams;
  return (
    <Stack gap={6}>
      <PageHeader
        title="Enter your code"
        lead={`We’ve sent a 6-digit code to ${pending.email}. It works for ${CODE_MINUTES} minutes.`}
      />
      <CodeForm
        check={checkSignInCode}
        sendNew={sendNewSignInCode}
        sent={sent}
        startAgain={{ href: '/sign-in', words: 'Use a different email' }}
        devOutbox={env().DEV_TOOLS && !sendsRealEmail()}
      />
    </Stack>
  );
}
