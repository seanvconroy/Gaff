import type { TaskList } from 'graphile-worker';
import { z } from 'zod';
import { draftAnswersFor } from '@/server/answers/draft';
import { processInboundEmail } from '@/server/enquiries/process';
import { processMedia } from '@/server/media/process';
import { sweepFreshness } from '@/server/listings/freshness';
import { closeEnquiries } from '@/server/listings/manage';
import { redactIdentity } from '@/server/verification/identity';
import { markReferenceOverdue } from '@/server/checks/checks';
import { sendMessage } from '@/server/messages/outbox';
import { expireHomeOffer } from '@/server/offers/offer';
import { sendRtbReminder } from '@/server/tenancy/rtb';
import { matchListing, sendAlerts, sendDailyAlerts } from '@/server/alerts/match';
import { sweepMarketplace } from '@/server/retention/marketplace';
import { sweepPersonalData } from '@/server/retention/sweep';
import { expireOffer, offerFreedPlace } from '@/server/viewings/waitlist';

const inboundEmailJob = z.object({ organisationId: z.uuid(), inboundEmailId: z.uuid() });
const messageJob = z.object({ organisationId: z.uuid(), messageId: z.uuid() });

/**
 * R26 (ADR-0005): the retention job, daily at 02:30 UTC. "?fill=2d" runs a missed one when jobs
 * next run, so a quiet night or a deploy never skips it.
 */
export const CRONTAB = [
  '30 2 * * * retention_sweep ?fill=2d',
  // M49: daily, listings not confirmed for 14 days get a reminder, and are paused 3 days later.
  '15 8 * * * listings_freshness ?fill=2d',
  // M86: daily alerts at 8am in Ireland, which is 7am or 8am UTC; the task checks the hour.
  '0 7,8 * * * alerts_daily ?fill=1h',
].join('\n');

/** Every background task. Tasks are thin: they call use cases in src/server. */
export const taskList: TaskList = {
  process_inbound_email: async (payload) => {
    await processInboundEmail(inboundEmailJob.parse(payload));
  },
  offer_place: async (payload) => {
    const job = z.object({ organisationId: z.uuid(), slotId: z.uuid() }).parse(payload);
    await offerFreedPlace(job.organisationId, job.slotId);
  },
  expire_offer: async (payload) => {
    await expireOffer(z.object({ organisationId: z.uuid(), offerId: z.uuid() }).parse(payload));
  },
  // M86, M87: alerts.
  alerts_match: async (payload) => {
    await matchListing(z.object({ listingId: z.uuid() }).parse(payload).listingId);
  },
  alerts_send: async (payload) => {
    const job = z
      .object({ userId: z.string().min(1), frequency: z.enum(['instant', 'daily']) })
      .parse(payload);
    await sendAlerts(job.userId, job.frequency);
  },
  alerts_daily: async () => {
    const sent = await sendDailyAlerts();
    if (sent) console.log(`Alerts: ${sent} homes sent in daily emails.`);
  },
  retention_sweep: async () => {
    const swept = await sweepPersonalData();
    // Counts only: never personal data in logs.
    console.log(
      `Retention: ${swept.applications} applications, ${swept.inboundEmails} emails and ${swept.references} references cleared; ${swept.recordEvents} record events and ${swept.recordDecisions} decisions past their period deleted.`,
    );
    const marketplace = await sweepMarketplace();
    console.log(
      `Retention: ${marketplace.visitorDays} visitor hashes and ${marketplace.closedPages} closed listing pages removed.`,
    );
  },
  reference_overdue: async (payload) => {
    await markReferenceOverdue(
      z.object({ organisationId: z.uuid(), checkId: z.uuid() }).parse(payload),
    );
  },
  expire_home_offer: async (payload) => {
    await expireHomeOffer(z.object({ organisationId: z.uuid(), offerId: z.uuid() }).parse(payload));
  },
  rtb_reminder: async (payload) => {
    await sendRtbReminder(
      z.object({ organisationId: z.uuid(), tenancyId: z.uuid() }).parse(payload),
    );
  },
  draft_answers: async (payload) => {
    await draftAnswersFor(messageJob.parse(payload));
  },
  redact_identity: async (payload) => {
    await redactIdentity(z.object({ organisationId: z.uuid(), checkId: z.uuid() }).parse(payload));
  },
  listings_freshness: async () => {
    const swept = await sweepFreshness();
    console.log(`Listings: ${swept.reminded} reminded, ${swept.paused} paused.`);
  },
  close_enquiries: async (payload) => {
    await closeEnquiries(
      z.object({ organisationId: z.uuid(), lettingId: z.uuid() }).parse(payload),
    );
  },
  process_media: async (payload) => {
    await processMedia(z.object({ organisationId: z.uuid(), mediaId: z.uuid() }).parse(payload));
  },
  send_message: async (payload, helpers) => {
    await sendMessage({
      ...messageJob.parse(payload),
      attempt: helpers.job.attempts,
      maxAttempts: helpers.job.max_attempts,
    });
  },
};
