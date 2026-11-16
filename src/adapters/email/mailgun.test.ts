import { afterEach, describe, expect, it, vi } from 'vitest';
import { mailgunSender } from './mailgun';

describe('ADR-0010: sending with Mailgun (EU)', () => {
  afterEach(() => vi.unstubAllGlobals());

  const email = {
    to: 'renter@example.ie',
    from: { name: 'Halcyon Lettings via Gaff', address: 'halcyon@mail.gaff.test' },
    replyTo: 'halcyon+r7@in.gaff.test',
    subject: '12 Ranelagh Road',
    text: 'Hello',
  };

  const send = async (message: typeof email & { html?: string }) => {
    const fetchMock = vi.fn(async () => Response.json({ id: '<mg-1@mail.gaff.test>' }));
    vi.stubGlobal('fetch', fetchMock);
    await mailgunSender({ apiKey: 'key-test', domain: 'mail.gaff.test' }).send(message);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    return { url, form: init.body as FormData };
  };

  it('sends plain text from the EU region, with tracking off', async () => {
    const { url, form } = await send(email);
    expect(url).toBe('https://api.eu.mailgun.net/v3/mail.gaff.test/messages');
    expect(form.get('text')).toBe('Hello');
    expect(form.get('html')).toBeNull();
    expect(form.get('h:Reply-To')).toBe('halcyon+r7@in.gaff.test');
    expect(form.get('o:tracking')).toBe('no');
  });

  it('UX-PP-10: sends the laid-out email beside its plain text when there is one', async () => {
    const { form } = await send({ ...email, html: '<p>Hello</p>' });
    expect(form.get('text')).toBe('Hello');
    expect(form.get('html')).toBe('<p>Hello</p>');
    // Laying a message out never turns tracking on (ADR-0005).
    expect(form.get('o:tracking')).toBe('no');
  });
});
