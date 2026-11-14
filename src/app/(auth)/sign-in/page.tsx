import type { Metadata } from 'next';
import Link from 'next/link';
import { safeNext } from '@/domain/auth/safe-next';
import { problemForCode, problemWords } from '@/domain/auth/sign-in-problems';
import { Stack, PageHeader } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { ProviderButtons } from '../ProviderButtons';
import { SignInForm } from './SignInForm';

export const metadata: Metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

/**
 * One sign-in for renting and letting (M1, AU3): Google or Apple, a password, or a code by
 * email. "next" brings someone back to what they were doing. Coming back from Google or Apple
 * without being signed in, the page says why, in a line.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; provider?: string }>;
}) {
  const { next: asked, error, provider } = await searchParams;
  const next = typeof asked === 'string' ? safeNext(asked, '') || undefined : undefined;
  const signUp = next ? `/sign-up?next=${encodeURIComponent(next)}` : '/sign-up';
  const problem = problemForCode(typeof error === 'string' ? error : undefined);
  const from = provider === 'google' || provider === 'apple' ? provider : undefined;
  return (
    <Stack gap={6}>
      <PageHeader title="Sign in" />
      {problem ? (
        <Notice tone={problem === 'cancelled' ? 'info' : 'warning'} role="alert">
          <p>{problemWords(problem, from)}</p>
        </Notice>
      ) : null}
      <ProviderButtons next={next} passkeys passkeyAutofill />
      <SignInForm next={next} />
      <p>
        New to Gaff? <Link href={signUp}>Create an account</Link>
      </p>
    </Stack>
  );
}
