import { Heart } from 'lucide-react';
import type { Metadata } from 'next';
import { siteCopy } from '@/copy/site';
import { requirePerson } from '@/server/context/current-person';
import { ButtonLink } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { PageHeader, Stack } from '@/ui/Layout';

export const metadata: Metadata = { title: siteCopy.saved.title };

/**
 * Saved (UX-NV-19): the homes a signed-in renter liked. Work package WP-23 builds saving; until
 * then it says what will be here.
 */
export default async function SavedPage() {
  await requirePerson();
  return (
    <Stack gap={8}>
      <PageHeader title={siteCopy.saved.title} />
      <EmptyState
        icon={Heart}
        title={siteCopy.saved.empty}
        action={
          <ButtonLink href="/" variant="secondary">
            {siteCopy.saved.action}
          </ButtonLink>
        }
      />
    </Stack>
  );
}
