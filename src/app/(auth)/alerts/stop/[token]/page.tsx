import type { Metadata } from 'next';
import Link from 'next/link';
import { readStopToken } from '@/server/alerts/tokens';
import { PageHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { stopAlertsAction } from './actions';

export const metadata: Metadata = { title: 'Stop alerts' };
export const dynamic = 'force-dynamic';

/**
 * M86: from an alert email, without signing in. A tap confirms it, so a mail scanner opening the
 * link doesn't stop anything; mail apps use the one-click endpoint instead (RFC 8058).
 */
export default async function StopAlertsPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { token } = await params;
  const { done } = await searchParams;
  const read = readStopToken(decodeURIComponent(token));
  if (!read) {
    return (
      <Stack gap={4}>
        <PageHeader title="This link isn’t working" />
        <p>
          You can change or stop every alert from <Link href="/my/alerts">your alerts</Link>.
        </p>
      </Stack>
    );
  }
  if (done) {
    return (
      <Stack gap={4}>
        <PageHeader title="Alerts stopped" />
        <Notice tone="success" role="status">
          <p>You won’t get {read.scope === 'a' ? 'any alerts' : 'alerts for this search'} now.</p>
        </Notice>
        <p>
          You can turn them back on from <Link href="/my/alerts">your alerts</Link> whenever you
          like.
        </p>
      </Stack>
    );
  }
  return (
    <Stack gap={6}>
      <PageHeader
        title={read.scope === 'a' ? 'Stop all your alerts?' : 'Stop alerts for this search?'}
      />
      <form action={stopAlertsAction.bind(null, decodeURIComponent(token))}>
        <SubmitButton pendingLabel="Stopping…">
          {read.scope === 'a' ? 'Stop all my alerts' : 'Stop these alerts'}
        </SubmitButton>
      </form>
    </Stack>
  );
}
