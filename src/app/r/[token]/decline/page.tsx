import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { DeclineOffer } from '../Decline';
import { LinkEnded, loadRenter } from '../load';

export const metadata: Metadata = { title: 'Decline the offer' };
export const dynamic = 'force-dynamic';

/** R20, UX-RN-20: "Decline", from the offer: one screen that says what will happen. */
export default async function DeclinePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const loaded = await loadRenter(token);
  if (!loaded) return <LinkEnded />;
  if (loaded.model.view !== 'offer') redirect(`/r/${token}`);
  return <DeclineOffer token={token} model={loaded.model} />;
}
