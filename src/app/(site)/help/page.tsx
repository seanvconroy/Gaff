import { ArrowDownUp, LifeBuoy, Map as MapIcon } from 'lucide-react';
import type { Metadata } from 'next';
import { placeDataCopy } from '@/copy/place-data';
import { resultsOrderCopy } from '@/copy/place-pages';
import { ActionList, ActionRow } from '@/ui/ActionList';
import { EmptyState } from '@/ui/EmptyState';
import { PageHeader, Stack } from '@/ui/Layout';

export const metadata: Metadata = { title: 'Help' };

/**
 * Help, from the account menu (UX-NV-8). A stub until the founders choose how people reach
 * Gaff's team: it says what will be here, and invents no address to write to.
 *
 * Q60: what search is built on is here, off the search screen itself: how results are ordered
 * (M59, also one tap from the results) and where the map and place data come from (M56).
 */
export default function HelpPage() {
  return (
    <Stack gap={8}>
      <PageHeader title="Help" />
      <EmptyState icon={LifeBuoy} title="Help with using Gaff will appear here." />
      <section aria-labelledby="help-search">
        <Stack gap={4}>
          <h2 id="help-search" className="type-title">
            About search
          </h2>
          <ActionList bare labelledBy="help-search">
            <ActionRow
              id="help-results-order"
              href="/how-results-are-ordered"
              icon={ArrowDownUp}
              title={resultsOrderCopy.title}
            />
            <ActionRow
              id="help-place-data"
              href="/map-and-place-data"
              icon={MapIcon}
              title={placeDataCopy.title}
            />
          </ActionList>
        </Stack>
      </section>
    </Stack>
  );
}
