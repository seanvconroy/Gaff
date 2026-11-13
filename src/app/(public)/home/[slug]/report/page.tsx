import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { publicListingBySlug } from '@/server/search/listing';
import { PageHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { ReportForm } from './ReportForm';

export const metadata: Metadata = {
  title: 'Report a listing',
  robots: { index: false, follow: false },
};

/** M96: report a listing. No account needed, and acknowledged at once. */
export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sent?: string }>;
}) {
  const { slug } = await params;
  const { sent } = await searchParams;
  const listing = await publicListingBySlug(slug);
  if (!listing) notFound();
  return (
    <Stack gap={8}>
      <PageHeader title="Report a listing" lead={listing.title} />
      {sent ? (
        <Stack gap={4}>
          <Notice tone="success" title="Thanks. We’ve got your report" role="status">
            <p>
              A person at Gaff will look at it: suspected scams within 4 working hours, anything
              else within a working day. If you gave your email address, we’ll tell you what we
              decide.
            </p>
          </Notice>
          <p>
            If you’ve paid money to anyone for this home, contact your bank straight away, and
            report it to the Gardaí.
          </p>
          <p>
            <Link href="/to-rent">Back to homes to rent</Link>
          </p>
        </Stack>
      ) : (
        <ReportForm slug={slug} />
      )}
    </Stack>
  );
}
