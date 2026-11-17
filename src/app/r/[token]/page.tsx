import type { Metadata } from 'next';
import { LinkEnded, loadRenter } from './load';
import { RenterHub } from './RenterHub';

export const metadata: Metadata = { title: 'Your enquiry' };
export const dynamic = 'force-dynamic';

/**
 * R9, UX-PP-7, UX-PP-8: the renter's private page. No account; the link is the key. One link
 * from the first reply to move-in, and it always shows where they stand now. The address holds
 * only codes: which screen of a flow (`q`), and a problem to say once. Never anything personal.
 */
export default async function RenterPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{
    q?: string;
    change?: string;
    check_problem?: string;
    offer_problem?: string;
  }>;
}) {
  const { token } = await params;
  const { q, change, check_problem, offer_problem } = await searchParams;
  const loaded = await loadRenter(token, { hub: true });
  if (!loaded) return <LinkEnded />;
  const { model } = loaded;
  return (
    <RenterHub
      token={token}
      model={model}
      options={{
        q,
        changing: change === 'answers',
        // UX-RN-14: only the checks ask who's looking; every other page needs the link alone.
        open: model.view === 'checks' ? await loaded.isOpen() : false,
        sentTo: loaded.sentTo,
        checkProblem: check_problem,
        offerProblem: offer_problem,
      }}
    />
  );
}
