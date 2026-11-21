import { afterEach, describe, expect, it, vi } from 'vitest';
import { msisdn, sinchRefusal, sinchSms } from './index';

const config = { servicePlanId: 'plan-123', token: 'made-up-token', from: 'Gaff' };

afterEach(() => vi.unstubAllGlobals());

function answering(status: number, body: unknown) {
  const fetched = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetched);
  return fetched;
}

describe('UX-SI-13, P16: texts through Sinch', () => {
  it('sends to Sinch’s EU region, with the service plan’s token', async () => {
    const fetched = answering(201, { id: 'batch-1' });
    const sent = await sinchSms(config).send({ to: '+353871234567', body: 'Your code is 042917.' });
    expect(sent).toEqual({ providerMessageId: 'batch-1' });
    const [url, request] = fetched.mock.calls[0] as unknown as [string, RequestInit];
    // Rule 10: the EU region, never the US one.
    expect(url).toBe('https://eu.sms.api.sinch.com/xms/v1/plan-123/batches');
    expect(request.method).toBe('POST');
    expect(new Headers(request.headers).get('authorization')).toBe('Bearer made-up-token');
    expect(JSON.parse(String(request.body))).toEqual({
      from: 'Gaff',
      // An MSISDN in international format: the digits, with no plus.
      to: ['353871234567'],
      body: 'Your code is 042917.',
    });
  });

  it('gives Sinch the number as digits, however Gaff holds it', () => {
    expect(msisdn('+353871234567')).toBe('353871234567');
    expect(msisdn('+44 7700 900123')).toBe('447700900123');
  });

  it('fails when Sinch refuses, and says why without the number', async () => {
    answering(403, { code: 'forbidden', text: 'Sender Gaff not allowed to +353871234567' });
    const failed = await sinchSms(config)
      .send({ to: '+353871234567', body: 'x' })
      .catch((error: Error) => error.message);
    expect(failed).toBe(
      'Sinch refused the SMS: 403 forbidden: Sender Gaff not allowed to [number]',
    );
    // Rule 8: no phone number reaches a log.
    expect(failed).not.toMatch(/353871234567/);
  });

  it('says why in Sinch’s own words when the answer isn’t JSON, with any number taken out', () => {
    expect(sinchRefusal(401, 'Unauthorized')).toBe('Sinch refused the SMS: 401 Unauthorized');
    expect(sinchRefusal(400, 'bad to 353871234567')).toBe(
      'Sinch refused the SMS: 400 bad to [number]',
    );
    expect(sinchRefusal(500, '')).toBe('Sinch refused the SMS: 500');
  });

  it('fails when Sinch answers without a batch', async () => {
    answering(201, {});
    await expect(sinchSms(config).send({ to: '+353871234567', body: 'x' })).rejects.toThrow(
      'Sinch did not return a batch id',
    );
  });
});
