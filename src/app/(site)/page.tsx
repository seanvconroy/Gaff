import { Search } from 'lucide-react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { siteCopy } from '@/copy/site';
import { firstScreenRedirect } from '@/domain/navigation/context';
import { currentPerson } from '@/server/context/current-person';
import { enquiriesNeedingThem } from '@/server/renter/enquiries';
import { EmptyState } from '@/ui/EmptyState';
import { PageHeader, Stack } from '@/ui/Layout';

export const metadata: Metadata = { title: siteCopy.search.title };

/**
 * The public site's first screen (UX-NV-20), which is Search on the renting side (UX-NV-19) and
 * where sign-in lands. Who is sent on from here, and where, is `firstScreenRedirect`: someone
 * letting goes to Today (UX-HM-1), and someone with no context yet to first run (UX-AC-6). Work
 * package WP-21 builds search; until then it says what will be here.
 */
export default async function FirstScreen({
  searchParams,
}: {
  searchParams: Promise<{ rent?: string | string[] }>;
}) {
  const [person, query] = await Promise.all([currentPerson(), searchParams]);
  // UX-RH-2: a renter opening Gaff (arriving from outside it, or signing in) opens on Enquiries
  // when a home needs them. Tapping Search in the bar comes from one of Gaff's own pages.
  const opening =
    person?.side === 'renting' && (await arrivingFromOutside())
      ? { needsThem: await enquiriesNeedingThem(person.userId) }
      : null;
  const onwards = firstScreenRedirect(person ? { side: person.side } : null, query, opening);
  if (onwards) redirect(onwards);
  return (
    <Stack gap={8}>
      <PageHeader title={siteCopy.search.title} />
      <EmptyState icon={Search} title={siteCopy.search.empty} />
    </Stack>
  );
}

/** Whether this request came from outside Gaff's own pages, or from signing in. */
async function arrivingFromOutside(): Promise<boolean> {
  const list = await headers();
  const referer = list.get('referer');
  if (!referer) return true;
  try {
    const from = new URL(referer);
    return from.host !== list.get('host') || from.pathname.startsWith('/sign-in');
  } catch {
    return true;
  }
}
