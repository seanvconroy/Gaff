import { env } from '@/lib/env';
import type { EmailSender } from '@/ports/email';
import { devOutboxSender } from './dev-outbox';
import { mailgunSender } from './mailgun';
import { resendSender } from './resend';

export function emailSender(): EmailSender {
  const config = env();
  switch (config.EMAIL_PROVIDER) {
    case 'dev':
      return devOutboxSender;
    case 'resend':
      return resendSender({ apiKey: config.RESEND_API_KEY! });
    case 'mailgun':
      return mailgunSender({ apiKey: config.MAILGUN_API_KEY!, domain: config.MAILGUN_DOMAIN! });
  }
}

/**
 * The address a mailbox sends from: `<mailbox>@MAIL_FROM_DOMAIN`, or the single
 * MAIL_FROM_ADDRESS when one is set (an interim test sender).
 */
export function senderAddress(
  mailbox: string,
  config: { MAIL_FROM_DOMAIN: string; MAIL_FROM_ADDRESS?: string } = env(),
): string {
  return config.MAIL_FROM_ADDRESS ?? `${mailbox}@${config.MAIL_FROM_DOMAIN}`;
}

/** Gaff's own sender, for operator email such as sign-in links. */
export function gaffSender(): { name: string; address: string } {
  return { name: 'Gaff', address: senderAddress('no-reply') };
}
