import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { askToViewCopy as copy } from '@/copy/home-page';
import { homeHref, isPublicRef } from '@/domain/homes/home-page';
import { publicHomes } from '@/server/homes/public-homes';
import { ButtonLink } from '@/ui/Button';
import { FlowShell } from '@/ui/FlowShell';
import { Outcome } from '@/ui/Outcome';

export const metadata: Metadata = { title: copy.title };

/**
 * THE SEAM for work package WP-22 (UX-AV-1 to UX-AV-9), which replaces this page with asking to
 * view: "Who should we reply to?", the home's questions one per screen, and "Sent". Until then
 * "Ask to view" on a home's page leads here, and it says how to reach the lister now. A home with
 * no page goes back to its address, which says so.
 */
export default async function AskToViewPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const [home] = await publicHomes({ ref });
  if (!home) redirect(isPublicRef(ref) ? homeHref(ref) : '/');
  return (
    <FlowShell
      leave={{ kind: 'close', href: home.href, label: copy.back }}
      primary={
        <ButtonLink href={home.href} variant="primary" fullWidth="phone">
          {copy.back}
        </ButtonLink>
      }
    >
      <Outcome tone="waiting" title={copy.title} headingLevel={1}>
        <p>{copy.text}</p>
        {home.phone ? <p>{copy.call(home.lister.name, home.phone)}</p> : null}
      </Outcome>
    </FlowShell>
  );
}
