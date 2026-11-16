import { MessagesSquare } from 'lucide-react';
import type { Metadata } from 'next';
import { siteCopy } from '@/copy/site';
import { requirePerson } from '@/server/context/current-person';
import { ButtonLink } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { PageHeader, Stack } from '@/ui/Layout';

export const metadata: Metadata = { title: siteCopy.enquiries.title };

/**
 * Enquiries (UX-NV-19, UX-NV-21): where a signed-in renter stands on each home they've asked
 * about. Work packages WP-12 and WP-14 build it; until then it says what will be here.
 */
export default async function EnquiriesPage() {
  await requirePerson();
  return (
    <Stack gap={8}>
      <PageHeader title={siteCopy.enquiries.title} />
      <EmptyState
        icon={MessagesSquare}
        title={siteCopy.enquiries.empty}
        action={
          <ButtonLink href="/" variant="secondary">
            {siteCopy.enquiries.action}
          </ButtonLink>
        }
      />
    </Stack>
  );
}
