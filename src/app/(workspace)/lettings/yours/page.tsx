import { UserRoundX } from 'lucide-react';
import type { Metadata } from 'next';
import { requireMember } from '@/server/auth/member';
import { ButtonLink } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { PageHeader, Stack } from '@/ui/Layout';

export const metadata: Metadata = { title: 'A letting you can’t open' };

/**
 * UX-AC-14 (rule 1): where a member lands when they try to open a letting for a home they
 * enquired about themselves, as a renter. Nobody works on, or decides, their own application.
 * It names no home: the address they came from isn't shown again here.
 */
export default async function OwnApplicationPage() {
  await requireMember();
  return (
    <Stack gap={8}>
      <PageHeader title="You can’t open this letting" />
      <EmptyState
        icon={UserRoundX}
        title="You enquired about this home yourself"
        action={
          <ButtonLink href="/lettings" variant="primary">
            Back to Lettings
          </ButtonLink>
        }
      >
        <p>
          So that nobody decides on their own application, someone else on your team runs this
          letting. We’ve let your admins know. You’ll hear about your enquiry by email, like every
          renter.
        </p>
      </EmptyState>
    </Stack>
  );
}
