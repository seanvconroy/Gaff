import type { Tx } from '@/db/client';
import type { WordingFinding } from '@/ports/ai';
import { recordEvent } from '@/server/record/events';
import type { RiskReason } from './risk';

/** The events for a wording hold: counts and grounds only, never the phrases (ADR-0006). */
export async function recordWordingEvents(
  tx: Tx,
  context: { listing: { id: string; organisationId: string }; letting: { id: string } },
  findings: readonly WordingFinding[],
  reasons: readonly RiskReason[] = ['unfair_wording'],
): Promise<void> {
  await recordEvent(tx, {
    organisationId: context.listing.organisationId,
    lettingId: context.letting.id,
    actor: { type: 'ai' },
    type: 'listing.wording_flagged',
    subject: { type: 'listing', id: context.listing.id },
    data: {
      listingId: context.listing.id,
      findings: findings.length,
      grounds: [...new Set(findings.map((f) => f.ground))],
    },
  });
  await recordEvent(tx, {
    organisationId: context.listing.organisationId,
    lettingId: context.letting.id,
    actor: { type: 'system' },
    type: 'listing.held',
    subject: { type: 'listing', id: context.listing.id },
    data: { listingId: context.listing.id, reasons: [...reasons] },
  });
}
