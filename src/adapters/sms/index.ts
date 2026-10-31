import { db } from '@/db/client';
import { devOutbox } from '@/db/schema';
import { env } from '@/lib/env';
import type { SmsSender } from '@/ports/sms';

/** Development stand-in: SMS appear in the development outbox. */
const fakeSms: SmsSender = {
  async send({ to, body }) {
    const [row] = await db()
      .insert(devOutbox)
      .values({ toAddress: to, fromAddress: 'SMS', subject: 'SMS', text: body })
      .returning({ id: devOutbox.id });
    return { providerMessageId: `sms-${row!.id}` };
  },
};

/** Sinch's EU region for SMS (ADR-0010). */
function sinchSms(config: { servicePlanId: string; token: string; from: string }): SmsSender {
  return {
    async send({ to, body }) {
      const response = await fetch(
        `https://eu.sms.api.sinch.com/xms/v1/${config.servicePlanId}/batches`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ from: config.from, to: [to], body }),
        },
      );
      if (!response.ok) {
        throw new Error(`Sinch refused the SMS: ${response.status} ${await response.text()}`);
      }
      const json = (await response.json()) as { id?: string };
      if (!json.id) throw new Error('Sinch did not return a batch id');
      return { providerMessageId: json.id };
    },
  };
}

export function smsSender(): SmsSender {
  const config = env();
  return config.SMS_PROVIDER === 'sinch'
    ? sinchSms({
        servicePlanId: config.SINCH_SERVICE_PLAN_ID!,
        token: config.SINCH_API_TOKEN!,
        from: config.SINCH_FROM!,
      })
    : fakeSms;
}
