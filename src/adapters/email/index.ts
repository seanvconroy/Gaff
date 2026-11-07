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

/** Gaff's own sender, for operator email such as sign-in links. */
export function gaffSender(): { name: string; address: string } {
  return { name: 'Gaff', address: `no-reply@${env().MAIL_FROM_DOMAIN}` };
}

/**
 * M86 (tech spec, Notifications): alerts go from their own subdomain, so a spike in alerts can't
 * affect the delivery of sign-in codes and messages.
 */
export function alertsSender(): { name: string; address: string } {
  const config = env();
  return {
    name: 'Gaff alerts',
    address: `alerts@${config.ALERTS_MAIL_FROM_DOMAIN ?? config.MAIL_FROM_DOMAIN}`,
  };
}
