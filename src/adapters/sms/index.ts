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

/**
 * A number as Sinch takes it: an MSISDN in international format, which is the digits with no
 * plus. Gaff keeps numbers as +353871234567.
 */
export function msisdn(mobile: string): string {
  return mobile.replace(/\D/g, '');
}

/**
 * Why Sinch refused, for the log: its status and its own code and words, with anything that
 * could be a phone number taken out (rule 8). Sinch's answer can repeat the number it was sent.
 */
export function sinchRefusal(status: number, answer: string): string {
  let said = answer;
  try {
    const parsed = JSON.parse(answer) as { code?: unknown; text?: unknown };
    said = [parsed.code, parsed.text].filter((part) => typeof part === 'string').join(': ');
  } catch {
    // Not JSON: its words as they came.
  }
  const safe = said.replace(/\+?\d[\d\s-]{5,}\d/g, '[number]').slice(0, 200);
  return `Sinch refused the SMS: ${status}${safe ? ` ${safe}` : ''}`;
}

/** Sinch's EU region for SMS (ADR-0010): the batches endpoint, with the service plan's token. */
export function sinchSms(config: {
  servicePlanId: string;
  token: string;
  from: string;
}): SmsSender {
  return {
    async send({ to, body }) {
      const response = await fetch(
        `https://eu.sms.api.sinch.com/xms/v1/${config.servicePlanId}/batches`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ from: config.from, to: [msisdn(to)], body }),
        },
      );
      if (!response.ok) throw new Error(sinchRefusal(response.status, await response.text()));
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
