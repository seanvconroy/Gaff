import type { Tx } from '@/db/client';
import { loadListing } from './context';
import { moveListing } from './publish';

/**
 * M50: a listing follows its letting. When the offer is accepted it's "Let agreed"; when the
 * letting closes it's "Let" or withdrawn. A listing that never went live is simply withdrawn.
 * Called inside the workflow's own transaction, so both change together.
 */
export async function followLetting(
  tx: Tx,
  lettingId: string,
  event: 'offer_accepted' | 'let' | 'withdrawn',
): Promise<void> {
  const context = await loadListing(tx, lettingId);
  if (!context) return;
  const status = context.listing.status;
  if (status === 'let' || status === 'withdrawn') return;
  const neverLive = status === 'draft' || status === 'in_review';

  if (event === 'withdrawn' || neverLive) {
    await moveListing(tx, context, 'withdrawn', 'letting', null);
    return;
  }
  if (status !== 'let_agreed') {
    await moveListing(tx, context, 'let_agreed', 'letting', null);
  }
  if (event === 'let') {
    const agreed = (await loadListing(tx, lettingId))!;
    await moveListing(tx, agreed, 'let', 'letting', null);
  }
}
