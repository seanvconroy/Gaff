import type { Metadata } from 'next';
import { env } from '@/lib/env';
import { Stack, PageHeader } from '@/ui/Layout';
import { SignInForm } from './SignInForm';

export const metadata: Metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default function SignInPage() {
  // UX-ME-1: one try at signing in, for the sign-in funnel. A random ID that lives in this page
  // and its form: no cookie, and nothing about the person or their device.
  const attempt = crypto.randomUUID();
  return (
    <Stack gap={6}>
      <PageHeader
        title="Sign in"
        lead="Enter your work email and we'll send you a link. There's no password to remember."
      />
      <SignInForm devOutbox={env().DEV_TOOLS} attempt={attempt} />
    </Stack>
  );
}
