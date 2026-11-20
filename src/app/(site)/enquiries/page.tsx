import { MessagesSquare } from 'lucide-react';
import type { Metadata } from 'next';
import { enquiriesCopy } from '@/copy/profile';
import { requirePerson } from '@/server/context/current-person';
import { enquiryRowsFor } from '@/server/renter/enquiries';
import { ButtonLink } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { HomeCard, HomeGrid } from '@/ui/HomeCard';
import { PageHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';

export const metadata: Metadata = { title: enquiriesCopy.title };

/**
 * Enquiries (UX-RH-1, UX-RH-3, UX-RH-5, UX-NV-19, UX-NV-21): every home the signed-in renter has
 * asked about, each with its photo, its address and one line saying where they stand and what's
 * next. Rows that need them come first; a let or closed home stays, marked, until its details
 * are deleted. A row opens that home's own page: the same one a private link opens.
 *
 * The list is the renter's own (`withPerson`); what each row says is read from the application
 * by the same rules as the page itself (src/server/renter/enquiries.ts).
 */
export default async function EnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ gone?: string }>;
}) {
  const [person, { gone }] = await Promise.all([requirePerson(), searchParams]);
  const rows = await enquiryRowsFor(person.userId);
  const goneNotice =
    gone === '1' ? (
      <Notice tone="info" title={enquiriesCopy.gone.title} role="status">
        <p>{enquiriesCopy.gone.text}</p>
      </Notice>
    ) : null;
  if (rows.length === 0) {
    return (
      <Stack gap={8}>
        <PageHeader title={enquiriesCopy.title} />
        {goneNotice}
        <EmptyState
          icon={MessagesSquare}
          title={enquiriesCopy.empty}
          action={
            <ButtonLink href="/" variant="secondary">
              {enquiriesCopy.emptyAction}
            </ButtonLink>
          }
        >
          <p>{enquiriesCopy.emptyText}</p>
        </EmptyState>
      </Stack>
    );
  }
  return (
    <Stack gap={8}>
      <PageHeader title={enquiriesCopy.title} />
      {goneNotice}
      <HomeGrid label={enquiriesCopy.list}>
        {rows.map((row) => (
          <HomeCard
            key={row.applicationId}
            href={`/enquiries/${row.applicationId}`}
            title={row.address}
            line={row.line}
            photo={row.photo}
            needsYou={row.needsYou ? enquiriesCopy.needsYou : null}
            headingLevel={2}
          />
        ))}
      </HomeGrid>
      <p>{enquiriesCopy.next}</p>
    </Stack>
  );
}
