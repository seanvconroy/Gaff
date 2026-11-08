import type { Metadata } from 'next';
import { sendsRealEmail } from '@/adapters/email';
import { env } from '@/lib/env';
import { Stack, PageHeader } from '@/ui/Layout';
import { SignInForm } from './SignInForm';

export const metadata: Metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

/** One sign-in for renting and letting (M1). "next" brings a renter back to what they were doing. */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <Stack gap={8}>
      <PageHeader title="Sign in" lead="We'll email you a link. There's no password to remember." />
      <SignInForm
        devOutbox={env().DEV_TOOLS && !sendsRealEmail()}
        next={typeof next === 'string' ? next : undefined}
      />
    </Stack>
  );
}
