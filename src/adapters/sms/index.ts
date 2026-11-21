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
    // Two shapes: the SMS API's { code, text }, and the Conversation API's { error: { status,
    // message } }.
    const parsed = JSON.parse(answer) as {
      code?: unknown;
      text?: unknown;
      error?: { status?: unknown; message?: unknown };
    };
    said = [parsed.code, parsed.text, parsed.error?.status, parsed.error?.message]
      .filter((part) => typeof part === 'string')
      .join(': ');
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

/**
 * Sinch's EU region through its Conversation API, which is what a new Sinch account is set up
 * for: a project, an app made in the EU region, and an access key (Q61).
 *
 * `DISPATCH` sends the text and keeps nothing more: Sinch makes no contact and no conversation
 * for the number, as it would by default. A sign-in code isn't a conversation.
 */
export function sinchConversationSms(config: {
  projectId: string;
  appId: string;
  keyId: string;
  keySecret: string;
  from: string;
}): SmsSender {
  const basic = Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64');
  return {
    async send({ to, body }) {
      const response = await fetch(
        `https://eu.conversation.api.sinch.com/v1/projects/${config.projectId}/messages:send`,
        {
          method: 'POST',
          headers: { authorization: `Basic ${basic}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            app_id: config.appId,
            recipient: {
              identified_by: { channel_identities: [{ channel: 'SMS', identity: to }] },
            },
            channel_properties: { SMS_SENDER: config.from },
            message: { text_message: { text: body } },
            processing_mode: 'DISPATCH',
          }),
        },
      );
      if (!response.ok) throw new Error(sinchRefusal(response.status, await response.text()));
      const json = (await response.json()) as { message_id?: string };
      if (!json.message_id) throw new Error('Sinch did not return a message id');
      return { providerMessageId: json.message_id };
    },
  };
}

export function smsSender(): SmsSender {
  const config = env();
  if (config.SMS_PROVIDER !== 'sinch') return fakeSms;
  // The settings are checked whole as the app starts (src/lib/env.ts): one kind or the other.
  if (config.SINCH_SERVICE_PLAN_ID && config.SINCH_API_TOKEN) {
    return sinchSms({
      servicePlanId: config.SINCH_SERVICE_PLAN_ID,
      token: config.SINCH_API_TOKEN,
      from: config.SINCH_FROM!,
    });
  }
  return sinchConversationSms({
    projectId: config.SINCH_PROJECT_ID!,
    appId: config.SINCH_APP_ID!,
    keyId: config.SINCH_KEY_ID!,
    keySecret: config.SINCH_KEY_SECRET!,
    from: config.SINCH_FROM!,
  });
}
