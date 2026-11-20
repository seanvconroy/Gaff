import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { AccountEmail } from '@/copy/account-emails';
import { hiddenReasons } from '@/copy/trust';
import {
  listingCheckingEmail,
  listingClearedEmail,
  listingNotShownEmail,
  listingsPausedEmail,
  pauseKeptEmail,
  pauseLiftedEmail,
} from '@/copy/trust-emails';
import { withOrg, withSystem } from '@/db/client';
import {
  lettings,
  listerPauses,
  listingCases,
  memberships,
  organisations,
  users,
} from '@/db/schema';
import { formatDate, formatDateTime } from '@/lib/format';

/**
 * BA-10 (M29, M48, M98, M107): the emails about a home the checks held, and about a paused
 * lister, in fixed words (src/copy/trust-emails.ts). Each is queued in the transaction that
 * made the change, and sent only while it's still true. The payload holds IDs; addresses are
 * read here, when it's sent. About a home: to its lead and the organisation's admins. About a
 * pause: to the admins.
 */
export const trustEmailJob = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('listing_checking'),
    organisationId: z.uuid(),
    lettingId: z.uuid(),
    caseId: z.uuid(),
  }),
  z.object({ kind: z.literal('listing_cleared'), organisationId: z.uuid(), lettingId: z.uuid() }),
  z.object({
    kind: z.literal('listing_not_shown'),
    organisationId: z.uuid(),
    lettingId: z.uuid(),
    caseId: z.uuid(),
  }),
  z.object({ kind: z.literal('listings_paused'), organisationId: z.uuid(), pauseId: z.uuid() }),
  z.object({ kind: z.literal('pause_lifted'), organisationId: z.uuid(), pauseId: z.uuid() }),
  z.object({ kind: z.literal('pause_kept'), organisationId: z.uuid(), pauseId: z.uuid() }),
]);
export type TrustEmailJob = z.infer<typeof trustEmailJob>;
export const trustEmailKinds: ReadonlyArray<TrustEmailJob['kind']> = trustEmailJob.options.map(
  (option) => option.shape.kind.value,
);

type Send = (to: string, email: AccountEmail, key: string) => Promise<void>;

/** Who is told: the organisation's admins, and the letting's lead for a home. */
async function recipients(organisationId: string, lettingId: string | null) {
  return withOrg(organisationId, async (tx) => {
    const [organisation] = await tx
      .select({ name: organisations.name, pausedAt: organisations.listingsPausedAt })
      .from(organisations)
      .where(eq(organisations.id, organisationId));
    const admins = await tx
      .select({ id: users.id, email: users.email })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.organisationId, organisationId), eq(memberships.role, 'admin')));
    const [letting] = lettingId
      ? await tx
          .select({
            address: lettings.addressLine1,
            hiddenAt: lettings.hiddenAt,
            stage: lettings.hiddenStage,
            after: lettings.hiddenAfter,
            leadId: users.id,
            leadEmail: users.email,
          })
          .from(lettings)
          .innerJoin(users, eq(users.id, lettings.leadUserId))
          .where(eq(lettings.id, lettingId))
      : [];
    const told = new Map<string, string>();
    if (letting) told.set(letting.leadId, letting.leadEmail);
    for (const admin of admins) told.set(admin.id, admin.email);
    return { organisation: organisation ?? null, letting: letting ?? null, told };
  });
}

export async function sendTrustEmail(payload: unknown, app: string, send: Send): Promise<void> {
  const job = trustEmailJob.parse(payload);
  if (
    job.kind === 'listing_checking' ||
    job.kind === 'listing_cleared' ||
    job.kind === 'listing_not_shown'
  ) {
    const { letting, told } = await recipients(job.organisationId, job.lettingId);
    if (!letting) return;
    const lettingUrl = `${app}/lettings/${job.lettingId}`;
    let email: AccountEmail;
    let when: string;
    if (job.kind === 'listing_cleared') {
      // Taken off again since: this would no longer be true.
      if (letting.hiddenAt !== null) return;
      email = listingClearedEmail({ address: letting.address, lettingUrl });
      when = 'cleared';
    } else {
      const [held] = await withSystem((tx) =>
        tx
          .select({
            dueBy: listingCases.dueBy,
            findings: listingCases.findings,
            decision: listingCases.decision,
            reason: listingCases.decisionReason,
            facts: listingCases.decisionFacts,
            decidedAt: listingCases.decidedAt,
          })
          .from(listingCases)
          .where(and(eq(listingCases.id, job.caseId), eq(listingCases.lettingId, job.lettingId))),
      );
      if (!held) return;
      if (job.kind === 'listing_checking') {
        if (letting.stage !== 'held' || letting.after !== 'check' || held.decision) return;
        email = listingCheckingEmail({
          address: letting.address,
          lookBy: formatDateTime(held.dueBy),
          phrases: (held.findings ?? []).map((finding) => finding.phrase),
          lettingUrl,
        });
      } else {
        if (letting.stage !== 'decided' || !held.reason || !held.facts || !held.decidedAt) return;
        email = listingNotShownEmail({
          address: letting.address,
          reason: held.reason,
          reasonWords: hiddenReasons[held.reason],
          facts: held.facts,
          decidedOn: formatDate(held.decidedAt),
          lettingUrl,
        });
      }
      when = job.caseId;
    }
    for (const [id, address] of told) {
      await send(address, email, `account-${job.kind}-${job.lettingId}-${id}-${when}`);
    }
    return;
  }

  const { organisation, told: everyone } = await recipients(job.organisationId, null);
  if (!organisation) return;
  const [pause] = await withSystem((tx) =>
    tx
      .select()
      .from(listerPauses)
      .where(
        and(eq(listerPauses.id, job.pauseId), eq(listerPauses.organisationId, job.organisationId)),
      ),
  );
  if (!pause) return;
  const pausedUrl = `${app}/paused`;
  let email: AccountEmail;
  if (job.kind === 'pause_lifted') {
    if (organisation.pausedAt !== null) return;
    email = pauseLiftedEmail({ listerName: organisation.name, lettingsUrl: `${app}/lettings` });
  } else {
    if (organisation.pausedAt === null || pause.endedAt !== null) return;
    if (job.kind === 'pause_kept' && pause.appealDecision !== 'hide_listing') return;
    const statement = {
      listerName: organisation.name,
      reason: pause.reason,
      reasonWords: hiddenReasons[pause.reason],
      facts: pause.facts,
      decidedOn: formatDate(
        job.kind === 'pause_kept' && pause.appealDecidedAt ? pause.appealDecidedAt : pause.pausedAt,
      ),
      pausedUrl,
    };
    email = job.kind === 'pause_kept' ? pauseKeptEmail(statement) : listingsPausedEmail(statement);
  }
  for (const [id, address] of everyone) {
    await send(address, email, `account-${job.kind}-${job.pauseId}-${id}`);
  }
}
