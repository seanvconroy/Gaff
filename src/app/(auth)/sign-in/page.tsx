import type { Metadata } from 'next';
import { env } from '@/lib/env';
import { Stack, PageHeader } from '@/ui/Layout';
import { SignInForm } from './SignInForm';

export const metadata: Metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default function SignInPage() {
  return (
    <Stack gap={8}>
      <PageHeader title="Sign in" lead="We'll email you a link. There's no password to remember." />
      <SignInForm devOutbox={env().DEV_TOOLS} />
    </Stack>
  );
}
