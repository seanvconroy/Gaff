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
 * UX-LT-19: who the forwarding flow's test enquiry comes from. Its own address, so a person's
 * forwarding rule can take it without taking Gaff's other mail to them, such as sign-in codes.
 */
export function forwardingTestSender(): { name: string; address: string } {
  return { name: 'Gaff', address: `forwarding-test@${env().MAIL_FROM_DOMAIN}` };
}

/** Gaff's own sender, for operator email such as sign-in links. */
export function gaffSender(): { name: string; address: string } {
  return { name: 'Gaff', address: `no-reply@${env().MAIL_FROM_DOMAIN}` };
}
