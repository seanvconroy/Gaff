import type { TaskList } from 'graphile-worker';
import { z } from 'zod';
import { draftAnswersFor } from '@/server/answers/draft';
import { processInboundEmail } from '@/server/enquiries/process';
import { processMedia } from '@/server/media/process';
import { markReferenceOverdue } from '@/server/checks/checks';
import { sendMessage } from '@/server/messages/outbox';
import { expireHomeOffer } from '@/server/offers/offer';
import { sendRtbReminder } from '@/server/tenancy/rtb';
import { sweepPersonalData } from '@/server/retention/sweep';
import { expireOffer, offerFreedPlace } from '@/server/viewings/waitlist';

const inboundEmailJob = z.object({ organisationId: z.uuid(), inboundEmailId: z.uuid() });
const messageJob = z.object({ organisationId: z.uuid(), messageId: z.uuid() });

/**
 * R26 (ADR-0005): the retention job, daily at 02:30 UTC. "?fill=2d" runs a missed one when jobs
 * next run, so a quiet night or a deploy never skips it.
 */
export const CRONTAB = '30 2 * * * retention_sweep ?fill=2d';

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
  retention_sweep: async () => {
    const swept = await sweepPersonalData();
    // Counts only: never personal data in logs.
    console.log(
      `Retention: ${swept.applications} applications, ${swept.inboundEmails} emails and ${swept.references} references cleared; ${swept.recordEvents} record events and ${swept.recordDecisions} decisions past their period deleted.`,
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
