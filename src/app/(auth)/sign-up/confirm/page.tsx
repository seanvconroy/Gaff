import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { sendsRealEmail } from '@/adapters/email';
import { CODE_MINUTES } from '@/domain/auth/codes';
import { env } from '@/lib/env';
import { readPending } from '@/server/auth/pending';
import { PageHeader, Stack } from '@/ui/Layout';
import { CodeForm } from '../../CodeForm';
import { confirmEmailAction, sendNewConfirmCode } from '../actions';

export const metadata: Metadata = { title: 'Confirm your email' };
export const dynamic = 'force-dynamic';

/**
 * AU2: the code that confirms a new account's email. It says the same when the address already
 * had an account: that person gets an email telling them so, and no code.
 */
export default async function ConfirmEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const pending = await readPending('confirm');
  if (!pending) redirect('/sign-up');
  const { sent } = await searchParams;
  return (
    <Stack gap={6}>
      <PageHeader
        title="Confirm your email"
        lead={`We’ve sent an email to ${pending.email}. Enter the 6-digit code from it to finish. It works for ${CODE_MINUTES} minutes.`}
      />
      <CodeForm
        check={confirmEmailAction}
        sendNew={sendNewConfirmCode}
        sent={sent}
        startAgain={{ href: '/sign-up', words: 'Use a different email' }}
        devOutbox={env().DEV_TOOLS && !sendsRealEmail()}
      />
    </Stack>
  );
}
