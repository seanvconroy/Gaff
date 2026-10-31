import type { TaskList } from 'graphile-worker';
import { z } from 'zod';
import { draftAnswersFor } from '@/server/answers/draft';
import { processInboundEmail } from '@/server/enquiries/process';
import { sendMessage } from '@/server/messages/outbox';

const inboundEmailJob = z.object({ organisationId: z.uuid(), inboundEmailId: z.uuid() });
const messageJob = z.object({ organisationId: z.uuid(), messageId: z.uuid() });

/** Every background task the worker runs. Tasks are thin: they call use cases in src/server. */
export const taskList: TaskList = {
  process_inbound_email: async (payload) => {
    await processInboundEmail(inboundEmailJob.parse(payload));
  },
  draft_answers: async (payload) => {
    await draftAnswersFor(messageJob.parse(payload));
  },
  send_message: async (payload, helpers) => {
    await sendMessage({
      ...messageJob.parse(payload),
      attempt: helpers.job.attempts,
      maxAttempts: helpers.job.max_attempts,
    });
  },
};
