import { env, type Env } from '@/lib/env';
import type { EmailSender } from '@/ports/email';
import { devOutboxSender } from './dev-outbox';
import { mailgunSender } from './mailgun';
import { resendSender } from './resend';
import { isMadeUpAddress, parseAddressList, testCopySender } from './test-copy';

function providerSender(config: Env): EmailSender {
  switch (config.EMAIL_PROVIDER) {
    case 'dev':
      return devOutboxSender;
    case 'resend':
      return resendSender({ apiKey: config.RESEND_API_KEY! });
    case 'mailgun':
      return mailgunSender({ apiKey: config.MAILGUN_API_KEY!, domain: config.MAILGUN_DOMAIN! });
  }
}

/** Whether replies by email reach Gaff: receiving is set up for a real inbound domain. */
export function receivesEmail(config: Env = env()): boolean {
  if (config.EMAIL_PROVIDER === 'dev') return false;
  if (isMadeUpAddress(`gaff@${config.INBOUND_DOMAIN}`)) return false;
  return config.EMAIL_PROVIDER === 'mailgun' || Boolean(config.RESEND_WEBHOOK_SECRET);
}

/** Whether mail is really sent, rather than kept in the outbox for whoever runs Gaff. */
export function sendsRealEmail(config: Pick<Env, 'EMAIL_PROVIDER'> = env()): boolean {
  return config.EMAIL_PROVIDER !== 'dev';
}

export function emailSender(): EmailSender {
  const config = env();
  const provider = providerSender(config);
  if (config.EMAIL_PROVIDER === 'dev' || config.GAFF_ENV === 'production') return provider;
  // The test copy (and local runs with a real provider): real email for real people only.
  return testCopySender({
    real: provider,
    outbox: devOutboxSender,
    allowed: parseAddressList(config.TEST_EMAIL_RECIPIENTS),
    receivesReplies: receivesEmail(config),
  });
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
