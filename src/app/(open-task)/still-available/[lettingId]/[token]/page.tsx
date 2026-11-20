import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { freshnessCopy } from '@/copy/freshness';
import { formatDate } from '@/lib/format';
import { confirmByLink, stillAvailableByLink } from '@/server/lettings/freshness';
import { ButtonLink } from '@/ui/Button';
import { FlowShell, FlowTitle } from '@/ui/FlowShell';
import { Stack } from '@/ui/Layout';
import { Outcome } from '@/ui/Outcome';
import { SubmitButton } from '@/ui/SubmitButton';

export const metadata: Metadata = { title: freshnessCopy.page.title, robots: { index: false } };
export const dynamic = 'force-dynamic';

const copy = freshnessCopy;

async function confirmAction(lettingId: string, token: string): Promise<void> {
  'use server';
  const done = await confirmByLink(lettingId, token);
  redirect(`/still-available/${lettingId}/${token}?done=${done ? '1' : '0'}`);
}

/**
 * M49 (BA-13): the email's "Still available" link, with no sign-in. It asks before it changes
 * anything, so a mail scanner opening the link confirms nothing on the lister's behalf. The link
 * is signed for the ask it answers; once answered, changed or asked again, it says so and
 * points to Gaff. The page names the home by its address and nothing more.
 */
export default async function StillAvailableByLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ lettingId: string; token: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const [{ lettingId, token }, { done }] = await Promise.all([params, searchParams]);
  if (done === '1') {
    return (
      <FlowShell
        leave={{ kind: 'close', href: '/today', label: copy.done.action }}
        primary={
          <ButtonLink href="/today" variant="primary" fullWidth="phone">
            {copy.done.action}
          </ButtonLink>
        }
      >
        <Outcome tone="success" title={copy.done.title} headingLevel={1}>
          <p>{copy.done.text}</p>
        </Outcome>
      </FlowShell>
    );
  }
  const home = done === '0' ? null : await stillAvailableByLink(lettingId, token);
  if (!home) {
    return (
      <FlowShell
        leave={{ kind: 'close', href: '/today', label: copy.expired.action }}
        primary={
          <ButtonLink href="/today" variant="primary" fullWidth="phone">
            {copy.expired.action}
          </ButtonLink>
        }
      >
        <Outcome tone="info" title={copy.expired.title} headingLevel={1}>
          <p>{copy.expired.text}</p>
        </Outcome>
      </FlowShell>
    );
  }
  return (
    <FlowShell
      leave={{ kind: 'close', href: '/today', label: copy.expired.action }}
      form={{ action: confirmAction.bind(null, lettingId, token) }}
      primary={
        <SubmitButton fullWidth="phone" pendingLabel={copy.page.pending}>
          {copy.page.button}
        </SubmitButton>
      }
    >
      <FlowTitle title={copy.page.title} lead={home.address} />
      <Stack gap={4}>
        <p>
          {home.shown.kind === 'asked'
            ? copy.page.asked(formatDate(home.shown.stepsBackAt))
            : copy.page.stale(formatDate(home.shown.since))}
        </p>
        <p>{copy.page.letByEmail}</p>
        <p>{copy.page.next}</p>
      </Stack>
    </FlowShell>
  );
}
