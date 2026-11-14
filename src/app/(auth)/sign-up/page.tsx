import type { Metadata } from 'next';
import Link from 'next/link';
import { safeNext } from '@/domain/auth/safe-next';
import { PageHeader, Stack } from '@/ui/Layout';
import { ProviderButtons } from '../ProviderButtons';
import { SignUpForm } from './SignUpForm';

export const metadata: Metadata = { title: 'Create an account' };
export const dynamic = 'force-dynamic';

/** AU1: a new account, for renting, letting or both (M1). */
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next: asked } = await searchParams;
  const next = typeof asked === 'string' ? safeNext(asked, '') || undefined : undefined;
  const signIn = next ? `/sign-in?next=${encodeURIComponent(next)}` : '/sign-in';
  return (
    <Stack gap={6}>
      <PageHeader title="Create an account" />
      <ProviderButtons next={next} />
      <SignUpForm next={next} />
      <p>With a password, we’ll email you a 6-digit code next, to confirm your address.</p>
      <p>
        Already have an account? <Link href={signIn}>Sign in</Link>
      </p>
    </Stack>
  );
}
