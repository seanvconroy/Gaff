import type { TaskList } from 'graphile-worker';
import { z } from 'zod';
import { sweepProfiles } from '@/server/accounts/delete-profile';
import { sendAccountEmail } from '@/server/accounts/emails';
import { sweepAiCalls } from '@/server/ai/usage';
import { draftAnswersFor } from '@/server/answers/draft';
import {
  dropExpiredWaitingEnquiries,
  dropWaitingEnquiry,
  sendWaitingReply,
} from '@/server/enquiries/ask-to-view';
import { processInboundEmail } from '@/server/enquiries/process';
import { markReferenceOverdue } from '@/server/checks/checks';
import { sendMessage } from '@/server/messages/outbox';
import { expireHomeOffer } from '@/server/offers/offer';
import { sendRtbReminder } from '@/server/tenancy/rtb';
import { refreshRegister } from '@/server/register/refresh';
import { sweepPersonalData } from '@/server/retention/sweep';
import { sweepPlaceMisses } from '@/server/places/places';
import { sweepMapCounts } from '@/server/search/map-counts';
import { sweepPhotoUploads } from '@/server/lettings/photos';
import { endLetHomePages } from '@/server/homes/let-pages';
import { purgeListingReports } from '@/server/homes/report';
import { sendSearchAlerts, sweepEmailSearches } from '@/server/saved/alerts';
import { sendSavedSearchEmail } from '@/server/saved/emails';
import { expireOffer, offerFreedPlace } from '@/server/viewings/waitlist';
import { redactIdentitySessions, redactSession } from '@/server/identity/redact';

const inboundEmailJob = z.object({ organisationId: z.uuid(), inboundEmailId: z.uuid() });
const messageJob = z.object({ organisationId: z.uuid(), messageId: z.uuid() });
const waitingJob = z.object({ organisationId: z.uuid(), waitingEnquiryId: z.uuid() });

/**
 * R26 (ADR-0005): the retention job, daily at 02:30 UTC. "?fill=2d" runs a missed one when jobs
 * next run, so a quiet night or a deploy never skips it.
 */
export const CRONTAB = [
  '30 2 * * * retention_sweep ?fill=2d',
  // UX-AG-1, UX-AG-6 (Q39): the PSRA register, weekly, early on Monday. A missed week runs when
  // jobs next run. The job key matches the one a first load uses, so two never queue up.
  '15 3 * * 1 psra_register_refresh ?fill=8d&jobKey=psra_register_refresh&max=5',
  // UX-SR-10: alerts for saved searches, once a day, in the morning in Ireland. A missed one runs
  // when jobs next run; the job sends at most one email a day to anyone, however often it runs.
  '0 8 * * * saved_search_alerts ?fill=1d&jobKey=saved_search_alerts',
].join('\n');

/** Every background task. Tasks are thin: they call use cases in src/server. */
export const taskList: TaskList = {
  process_inbound_email: async (payload) => {
    await processInboundEmail(inboundEmailJob.parse(payload));
  },
  redact_identity_session: async (payload) => {
    await redactSession(z.object({ providerRef: z.string().min(1) }).parse(payload).providerRef);
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
    // UX-PF-7 (rule 9): renters' own profiles, unused for two years. Counts only.
    const profiles = await sweepProfiles();
    console.log(
      `Retention: ${profiles.deleted} unused profiles deleted; ${profiles.notices} told theirs will be in 30 days.`,
    );
    // UX-LS-10: a let home's page on gaff.ie, 30 days after it was let. Counts only.
    const pages = await endLetHomePages();
    console.log(`Homes on Gaff: ${pages.removed} let homes' pages removed.`);
    // M124 (rule 9): counts of places nobody found, after 30 days. Counts only.
    const misses = await sweepPlaceMisses();
    console.log(`Place search: ${misses.deleted} counts of places not found deleted.`);
    // M133 (rule 9): the search map's daily counts, after 13 months. Numbers only.
    const mapCounts = await sweepMapCounts();
    console.log(`Map: ${mapCounts.deleted} daily counts over 13 months old deleted.`);
    // M43: photos sent straight to the store and never finished, after a day. Counts only.
    const uploads = await sweepPhotoUploads();
    console.log(`Photos: ${uploads} unfinished uploads deleted.`);
    // UX-TS-3 (rule 9): reports of listings, six months after Gaff's team answered them.
    const reports = await purgeListingReports();
    console.log(`Reports: ${reports} reports of listings deleted.`);
    // UX-AV-6: any enquiry still waiting past its 24 hours, should its own job have missed it.
    const waiting = await dropExpiredWaitingEnquiries();
    console.log(`Asking to view: ${waiting} unconfirmed enquiries dropped.`);
    // UX-SR-10 (rule 9): saved searches held by an email alone, unconfirmed or two years old.
    const searches = await sweepEmailSearches();
    console.log(`Saved searches: ${searches.deleted} held by an email alone deleted.`);
    // P26 (rule 9): Stripe deletes the ID and selfie of each check 30 days after its result.
    const redaction = await redactIdentitySessions();
    console.log(
      `ID checks: ${redaction.redacted} redacted at the provider; ${redaction.failed} to try again.`,
    );
    // P3 (rule 9): the log of AI calls, after 12 months. It holds usage only, never text.
    console.log(`AI: ${await sweepAiCalls()} usage rows over 12 months old deleted.`);
  },
  saved_search_alerts: async () => {
    const sent = await sendSearchAlerts();
    // Counts only: never who was told, or about which home.
    console.log(`Saved searches: ${sent.emails} alerts queued, ${sent.homes} homes in them.`);
  },
  send_saved_search_email: async (payload) => {
    await sendSavedSearchEmail(payload);
  },
  psra_register_refresh: async () => {
    const refreshed = await refreshRegister();
    // Counts only: the register names businesses, and some are one person's.
    console.log(
      `PSRA register: ${refreshed.entries} businesses licensed to let (${refreshed.added} new, ${refreshed.removed} gone); ${refreshed.lapsed} agencies lapsed and ${refreshed.renewed} renewed.`,
    );
  },
  send_account_email: async (payload, helpers) => {
    await sendAccountEmail(payload, String(helpers.job.id));
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
  send_waiting_reply: async (payload) => {
    await sendWaitingReply(waitingJob.parse(payload));
  },
  drop_waiting_enquiry: async (payload) => {
    await dropWaitingEnquiry(waitingJob.parse(payload));
  },
  send_message: async (payload, helpers) => {
    await sendMessage({
      ...messageJob.parse(payload),
      attempt: helpers.job.attempts,
      maxAttempts: helpers.job.max_attempts,
    });
  },
};
