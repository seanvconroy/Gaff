import type { Metadata } from 'next';
import { profileCopy } from '@/copy/profile';
import { ButtonLink } from '@/ui/Button';
import { Narrow, Stack } from '@/ui/Layout';
import { Outcome } from '@/ui/Outcome';

export const metadata: Metadata = { title: profileCopy.deleted.title };

/**
 * UX-PF-6: the profile is gone. What stays, in one line; whether they're still signed in; and
 * where to go next. It names nobody: the person it was for may already be signed out.
 */
export default async function ProfileDeletedPage({
  searchParams,
}: {
  searchParams: Promise<{ signIn?: string }>;
}) {
  const { signIn } = await searchParams;
  const keepsSignIn = signIn === 'kept';
  const d = profileCopy.deleted;
  return (
    <Narrow>
      <Stack gap={6}>
        <Outcome tone="success" title={d.title} headingLevel={1} role="status">
          <p>{d.text}</p>
          <p>{keepsSignIn ? d.keepsSignIn : d.signedOut}</p>
        </Outcome>
        <div>
          <ButtonLink href={keepsSignIn ? '/today' : '/'} variant="primary" fullWidth="phone">
            {keepsSignIn ? d.actionLetting : d.action}
          </ButtonLink>
        </div>
      </Stack>
    </Narrow>
  );
}
