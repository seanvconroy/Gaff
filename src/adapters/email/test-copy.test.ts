import { describe, expect, it } from 'vitest';
import { TEST_COPY_REPLY_NOTE } from '@/copy/test-copy';
import type { EmailSender, OutgoingEmail } from '@/ports/email';
import {
  canonicalAddress,
  getsRealEmail,
  isMadeUpAddress,
  parseAddressList,
  testCopySender,
} from './test-copy';

function recorder() {
  const sent: OutgoingEmail[] = [];
  const sender: EmailSender = {
    async send(email) {
      sent.push(email);
      return { providerMessageId: `id-${sent.length}` };
    },
  };
  return { sent, sender };
}

const email: OutgoingEmail = {
  to: 'tester@gmail.com',
  from: { name: 'Halcyon Lettings via Gaff', address: 'halcyon@mail.gaff.test' },
  replyTo: 'halcyon+K7Q2@in.gaff.test',
  subject: 'Your enquiry about 12 Ranelagh Road',
  text: 'Thanks for your enquiry.',
};

describe('Test copy (ADR-0010): real email for real people, the outbox for made-up ones', () => {
  it('knows made-up addresses: reserved example domains, example.ie and test endings', () => {
    for (const address of [
      'aoife@example.ie',
      'ann@example.com',
      'agent@lettings.example.org',
      'ann@halcyon.test',
      'x@thing.invalid',
      'x@localhost',
      'x@home.example',
      'not-an-address',
      'trailing@',
    ]) {
      expect(isMadeUpAddress(address), address).toBe(true);
    }
    for (const address of ['tester@gmail.com', 'delivered@resend.dev', 'sean@examples.ie']) {
      expect(isMadeUpAddress(address), address).toBe(false);
    }
  });

  it('treats "+tags" and capitals as the same inbox', () => {
    expect(canonicalAddress(' Ann+Renter@Gmail.com ')).toBe('ann@gmail.com');
    expect(parseAddressList('Ann+x@gmail.com, @Resend.dev  bob@outlook.ie')).toEqual([
      'ann@gmail.com',
      '@resend.dev',
      'bob@outlook.ie',
    ]);
    expect(parseAddressList(' ')).toBeNull();
    expect(parseAddressList(undefined)).toBeNull();
  });

  it('sends real email to anyone real when no list is set, and only to the list when it is', () => {
    expect(getsRealEmail('tester@gmail.com', null)).toBe(true);
    expect(getsRealEmail('aoife@example.ie', null)).toBe(false);
    const list = parseAddressList('tester@gmail.com, @resend.dev');
    expect(getsRealEmail('Tester+renter@gmail.com', list)).toBe(true);
    expect(getsRealEmail('delivered@resend.dev', list)).toBe(true);
    expect(getsRealEmail('someone@gmail.com', list)).toBe(false);
    expect(getsRealEmail('aoife@example.ie', parseAddressList('@example.ie'))).toBe(false);
  });

  it('keeps made-up people’s mail in the outbox, untouched', async () => {
    const real = recorder();
    const outbox = recorder();
    const sender = testCopySender({
      real: real.sender,
      outbox: outbox.sender,
      allowed: null,
      receivesReplies: false,
    });
    await sender.send({ ...email, to: 'aoife@example.ie' });
    expect(real.sent).toEqual([]);
    expect(outbox.sent).toEqual([{ ...email, to: 'aoife@example.ie' }]);
  });

  it('sends someone left off TEST_EMAIL_RECIPIENTS to the outbox too', async () => {
    const real = recorder();
    const outbox = recorder();
    const sender = testCopySender({
      real: real.sender,
      outbox: outbox.sender,
      allowed: parseAddressList('founder@gmail.com'),
      receivesReplies: false,
    });
    await sender.send({ ...email, to: 'stranger@gmail.com' });
    expect(real.sent).toEqual([]);
    expect(outbox.sent).toHaveLength(1);
  });

  it('drops a Reply-To nobody receives, and says how to write back instead', async () => {
    const real = recorder();
    const outbox = recorder();
    const sender = testCopySender({
      real: real.sender,
      outbox: outbox.sender,
      allowed: null,
      receivesReplies: false,
    });
    await sender.send({ ...email, html: '<html><body><p>Thanks.</p></body></html>' });
    expect(outbox.sent).toEqual([]);
    expect(real.sent).toHaveLength(1);
    expect(real.sent[0]!.replyTo).toBeUndefined();
    expect(real.sent[0]!.text).toBe(`Thanks for your enquiry.\n\n${TEST_COPY_REPLY_NOTE}`);
    expect(real.sent[0]!.html).toBe(
      `<html><body><p>Thanks.</p><p>${TEST_COPY_REPLY_NOTE}</p></body></html>`,
    );
  });

  it('sends mail without a Reply-To, such as sign-in codes, exactly as written', async () => {
    const real = recorder();
    const sender = testCopySender({
      real: real.sender,
      outbox: recorder().sender,
      allowed: null,
      receivesReplies: false,
    });
    const signIn = { ...email, replyTo: undefined, subject: 'Your code for Gaff' };
    await sender.send(signIn);
    expect(real.sent).toEqual([signIn]);
  });

  it('keeps the Reply-To once receiving is set up', async () => {
    const real = recorder();
    const sender = testCopySender({
      real: real.sender,
      outbox: recorder().sender,
      allowed: null,
      receivesReplies: true,
    });
    await sender.send(email);
    expect(real.sent).toEqual([email]);
  });
});
