import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { safeNext } from '@/domain/auth/safe-next';
import { STAFF_SESSION_HOURS } from '@/domain/auth/staff-access';
import { currentSession } from '@/server/auth/member';
import { signInOverview } from '@/server/auth/security';
import { PageHeader, Stack } from '@/ui/Layout';
import { ProviderButtons } from '../../ProviderButtons';
import { PasskeyAlone } from '../../sign-in/PasskeySignIn';
import { SignInForm } from '../../sign-in/SignInForm';

export const metadata: Metadata = { title: 'Confirm it’s you' };
export const dynamic = 'force-dynamic';

/**
 * AU7: before changing how you sign in, when the last sign-in was over an hour ago. It offers
 * only the ways this account has, and signing in again brings the person back to what they
 * were doing. With `with=passkey` it's the door to Gaff's own tools (M5): a passkey only.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; with?: string }>;
}) {
  const { next: asked, with: only } = await searchParams;
  const next = safeNext(asked, '/account/security');
  const session = await currentSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  // M5: Gaff's own tools take a passkey and nothing else.
  if (only === 'passkey') {
    return (
      <Stack gap={6}>
        <PageHeader
          title="Sign in with your passkey"
          lead={`Gaff’s own tools open only to a passkey, used in the last ${STAFF_SESSION_HOURS} hours. It’s one touch.`}
        />
        <PasskeyAlone next={next} />
        <p>
          <Link href="/account/security">How you sign in</Link>
        </p>
      </Stack>
    );
  }
  const overview = await signInOverview(session.user.id, session.session.id);
  const connected = (['google', 'apple'] as const).filter((who) => overview.providers[who]);
  return (
    <Stack gap={6}>
      <PageHeader
        title="Confirm it’s you"
        lead="To change how you sign in, sign in again first. It’s how we know it’s still you, and not someone else at your device."
      />
      <ProviderButtons next={next} passkeys={overview.passkeys.length > 0} only={connected} />
      <SignInForm next={next} fixedEmail={session.user.email} password={overview.hasPassword} />
      <p>
        <Link href={next}>Not now</Link>
      </p>
    </Stack>
  );
}
