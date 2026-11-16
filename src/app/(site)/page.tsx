import { Search } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { siteCopy } from '@/copy/site';
import { firstScreenRedirect } from '@/domain/navigation/context';
import { currentPerson } from '@/server/context/current-person';
import { EmptyState } from '@/ui/EmptyState';
import { PageHeader, Stack } from '@/ui/Layout';

export const metadata: Metadata = { title: siteCopy.search.title };

/**
 * The public site's first screen (UX-NV-20), which is Search on the renting side (UX-NV-19) and
 * where sign-in lands. Who is sent on from here, and where, is `firstScreenRedirect`: someone
 * letting goes to Today (UX-HM-1). Work package WP-21 builds search; until then it says what
 * will be here.
 */
export default async function FirstScreen({
  searchParams,
}: {
  searchParams: Promise<{ rent?: string | string[] }>;
}) {
  const [person, query] = await Promise.all([currentPerson(), searchParams]);
  const onwards = firstScreenRedirect(person?.context ?? null, query);
  if (onwards) redirect(onwards);
  return (
    <Stack gap={8}>
      <PageHeader title={siteCopy.search.title} />
      <EmptyState icon={Search} title={siteCopy.search.empty} />
    </Stack>
  );
}
