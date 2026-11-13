import type { Metadata } from 'next';
import Link from 'next/link';
import { safeNext } from '@/domain/auth/safe-next';
import { PageHeader, Stack } from '@/ui/Layout';
import { ForgotForm } from './ForgotForm';

export const metadata: Metadata = { title: 'Reset your password' };
export const dynamic = 'force-dynamic';

/** AU5: a forgotten password, or a first one for someone who has only used a code or Google. */
export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next: asked } = await searchParams;
  const next = typeof asked === 'string' ? safeNext(asked, '') || undefined : undefined;
  return (
    <Stack gap={6}>
      <PageHeader
        title="Reset your password"
        lead="We’ll email you a 6-digit code. Then you choose a new password."
      />
      <ForgotForm next={next} />
      <p>
        <Link href={next ? `/sign-in?next=${encodeURIComponent(next)}` : '/sign-in'}>
          Back to sign in
        </Link>
      </p>
    </Stack>
  );
}
