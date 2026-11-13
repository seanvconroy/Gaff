import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { confirmAvailableByLink } from '@/server/listings/freshness';
import { PageHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';

export const metadata: Metadata = { title: 'Still available?' };
export const dynamic = 'force-dynamic';

async function confirmAction(organisationId: string, listingId: string, token: string) {
  'use server';
  const outcome = await confirmAvailableByLink(organisationId, listingId, token);
  redirect(`/listings/confirm/${organisationId}/${listingId}/${token}?done=${outcome}`);
}

/**
 * M49: the one-tap link in the reminder email. It asks before it changes anything, so a mail
 * scanner opening the link doesn't confirm on the letter's behalf.
 */
export default async function ConfirmPage({
  params,
  searchParams,
}: {
  params: Promise<{ organisationId: string; listingId: string; token: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { organisationId, listingId, token } = await params;
  const { done } = await searchParams;
  return (
    <Stack gap={6}>
      <PageHeader title="Is the home still available?" />
      {done === 'confirmed' ? (
        <Notice tone="success" title="Thanks" role="status">
          <p>Renters see it as confirmed available today. We’ll ask again in 14 days.</p>
        </Notice>
      ) : done === 'invalid' ? (
        <Notice tone="warning" role="alert">
          <p>
            This link has already been used or replaced. Sign in to Gaff to confirm it from the
            listing.
          </p>
        </Notice>
      ) : (
        <form action={confirmAction.bind(null, organisationId, listingId, token)}>
          <SubmitButton pendingLabel="Confirming…">Yes, it’s still available</SubmitButton>
        </form>
      )}
    </Stack>
  );
}
