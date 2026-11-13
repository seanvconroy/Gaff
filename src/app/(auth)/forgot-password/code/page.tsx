import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { sendsRealEmail } from '@/adapters/email';
import { CODE_MINUTES } from '@/domain/auth/codes';
import { env } from '@/lib/env';
import { readPending } from '@/server/auth/pending';
import { PageHeader, Stack } from '@/ui/Layout';
import { ResetForm } from './ResetForm';

export const metadata: Metadata = { title: 'Choose a new password' };
export const dynamic = 'force-dynamic';

/** AU5: the reset code and the new password. It says the same for any address. */
export default async function ResetCodePage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const pending = await readPending('reset');
  if (!pending) redirect('/forgot-password');
  const { sent } = await searchParams;
  return (
    <Stack gap={6}>
      <PageHeader
        title="Choose a new password"
        lead={`If there’s a Gaff account for ${pending.email}, we’ve sent a 6-digit code to it. It works for ${CODE_MINUTES} minutes.`}
      />
      <ResetForm
        email={pending.email}
        sent={sent}
        devOutbox={env().DEV_TOOLS && !sendsRealEmail()}
      />
    </Stack>
  );
}
