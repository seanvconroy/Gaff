import type { Metadata } from 'next';
import Link from 'next/link';
import { safeNext } from '@/domain/auth/safe-next';
import { Stack, PageHeader } from '@/ui/Layout';
import { SignInForm } from './SignInForm';

export const metadata: Metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

/**
 * One sign-in for renting and letting (M1, AU3). "next" brings someone back to what they were
 * doing.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next: asked } = await searchParams;
  const next = typeof asked === 'string' ? safeNext(asked, '') || undefined : undefined;
  const signUp = next ? `/sign-up?next=${encodeURIComponent(next)}` : '/sign-up';
  return (
    <Stack gap={6}>
      <PageHeader title="Sign in" />
      <SignInForm next={next} />
      <p>
        New to Gaff? <Link href={signUp}>Create an account</Link>
      </p>
    </Stack>
  );
}
