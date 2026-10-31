import type { TaskList } from 'graphile-worker';
import { z } from 'zod';
import { processInboundEmail } from '@/server/enquiries/process';

const inboundEmailJob = z.object({ organisationId: z.uuid(), inboundEmailId: z.uuid() });

/** Every background task the worker runs. Tasks are thin: they call use cases in src/server. */
export const taskList: TaskList = {
  process_inbound_email: async (payload) => {
    await processInboundEmail(inboundEmailJob.parse(payload));
  },
};
