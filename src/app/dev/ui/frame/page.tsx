import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { listerFrom, type FrameAudience, type FrameHome } from '@/domain/frame/frame';
import { env } from '@/lib/env';
import { Button } from '@/ui/Button';
import { ChipLinks } from '@/ui/Chips';
import { Stack } from '@/ui/Layout';
import { Outcome } from '@/ui/Outcome';
import { FromAssistant, PrivateFrame } from '@/ui/PrivateFrame';

export const metadata: Metadata = { title: 'The private page frame' };
export const dynamic = 'force-dynamic';

const here = '/dev/ui/frame';
const readers = ['renter', 'tenant', 'owner', 'referee', 'ended'] as const;
type Reader = (typeof readers)[number];

const labels: Record<Reader, string> = {
  renter: 'A renter',
  tenant: 'The tenant',
  owner: 'An owner',
  referee: 'A referee',
  ended: 'A link that has ended',
};

/** A made-up agency. It has a phone number, which no real lister has yet (Q43). */
const agency = listerFrom({
  name: 'Halcyon Lettings',
  kind: 'agency',
  psraLicenceNumber: '001234',
  inboundSlug: 'halcyon-lettings',
  phone: '01 496 0000',
});

const home: FrameHome = {
  addressLine1: '12 Ranelagh Road',
  area: 'Ranelagh, Dublin 6',
  monthlyRentCents: 185_000,
  bedrooms: 2,
  propertyType: 'apartment',
  availableFrom: '2026-12-13',
  status: 'live',
};

/**
 * Development only (DEV_TOOLS=1): the frame of every page reached by a private link (work package
 * WP-6), for each kind of reader, with made-up details. The agency here has a phone number, so
 * "Talk to a person" shows both ways to reach one.
 */
export default async function FramePage({
  searchParams,
}: {
  searchParams: Promise<{ for?: string }>;
}) {
  if (!env().DEV_TOOLS) notFound();
  const { for: asked } = await searchParams;
  const reader: Reader = readers.find((r) => r === asked) ?? 'renter';
  const audience: FrameAudience = reader === 'owner' || reader === 'referee' ? reader : 'renter';
  const chips = (
    <ChipLinks
      label="Who the page is for"
      items={readers.map((each) => ({
        href: `${here}?for=${each}`,
        label: labels[each],
        current: each === reader,
      }))}
    />
  );
  if (reader === 'ended') {
    return (
      <PrivateFrame audience="renter" lister={null}>
        <Stack gap={6}>
          {chips}
          <Outcome tone="info" title="This link isn’t working" headingLevel={1}>
            <p>It may have expired. Reply to any email from us and we’ll help you.</p>
          </Outcome>
        </Stack>
      </PrivateFrame>
    );
  }
  return (
    <PrivateFrame
      audience={audience}
      lister={agency}
      home={
        reader === 'referee'
          ? undefined
          : reader === 'tenant'
            ? { ...home, status: 'let', tenancyStartDate: '2026-12-20' }
            : home
      }
      next={
        reader === 'renter' ? (
          <p>
            Viewings start on Friday 20 November. If you’re invited to view, we’ll email you a link
            to book a time that suits you. Either way, you’ll hear back from us.
          </p>
        ) : undefined
      }
    >
      <Stack gap={6}>
        {chips}
        {reader === 'referee' ? (
          <h1 className="type-display-mobile">A reference for Aoife Byrne</h1>
        ) : null}
        <Stack gap={4}>
          <h2 className="type-title">The page’s one task</h2>
          <p>
            Each page has one thing to do or one thing to know, and one main button, which spans the
            screen on a phone.
          </p>
          <Button variant="primary" fullWidth="phone">
            The main action
          </Button>
        </Stack>
        {reader === 'renter' ? (
          <FromAssistant listerName={agency.name}>
            <p>Yes, there’s a small back garden, shared with the flat upstairs.</p>
          </FromAssistant>
        ) : null}
      </Stack>
    </PrivateFrame>
  );
}
