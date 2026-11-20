import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CancelViewing } from '../Booking';
import { LinkEnded, loadRenter } from '../load';

export const metadata: Metadata = { title: 'Cancel your viewing' };
export const dynamic = 'force-dynamic';

/** R12, UX-RN-8: "Cancel", from the booked page: one screen that says what will happen. */
export default async function CancelPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const loaded = await loadRenter(token);
  if (!loaded) return <LinkEnded />;
  if (loaded.model.view !== 'booked') redirect(`/r/${token}`);
  return <CancelViewing token={token} model={loaded.model} />;
}
