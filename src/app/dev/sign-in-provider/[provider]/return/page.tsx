import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { providerModes } from '@/server/auth/providers';
import { callbackUrl } from '@/server/auth/stand-in-provider';
import { buttonClass } from '@/ui/Button';
import { PageHeader, Stack } from '@/ui/Layout';
import styles from '../../../outbox/outbox.module.css';

export const metadata: Metadata = { title: 'Stand-in sign-in', referrer: 'same-origin' };
export const dynamic = 'force-dynamic';

/**
 * Local development and tests only: Apple sends people back with a form post, not a link. This
 * page is that form, for the stand-in. Pressing the button posts it to Gaff's own callback.
 */
export default async function StandInReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ provider: string }>;
  searchParams: Promise<{ code?: string; state?: string }>;
}) {
  const { provider } = await params;
  if (provider !== 'google' && provider !== 'apple') notFound();
  if (providerModes()[provider] !== 'stand_in') notFound();
  const { code, state } = await searchParams;
  if (!code || !state) notFound();
  return (
    <main className={styles.main}>
      <Stack gap={6}>
        <PageHeader
          eyebrow="Development only"
          title="Back to Gaff"
          lead="Apple sends its answer as a form post. This is that form."
        />
        <form method="post" action={callbackUrl(provider)}>
          <input type="hidden" name="code" value={code} />
          <input type="hidden" name="state" value={state} />
          <button type="submit" className={buttonClass('primary')}>
            Continue to Gaff
          </button>
        </form>
      </Stack>
    </main>
  );
}
