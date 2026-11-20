import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { failureReason, sessionOutcome, stripeIdentity, verifyStripeSignature } from './stripe';

const secret = 'whsec_test_secret';
const sign = (payload: string, t: number) =>
  `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')}`;

afterEach(() => vi.unstubAllGlobals());

function stubFetch(...replies: Array<Record<string, unknown>>) {
  const calls: Array<{ url: string; body: string | null; headers: Record<string, string> }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({
        url,
        body: typeof init.body === 'string' ? init.body : null,
        headers: init.headers as Record<string, string>,
      });
      return new Response(JSON.stringify(replies.shift() ?? {}), { status: 200 });
    }),
  );
  return calls;
}

describe('P17 to P26: Stripe Identity', () => {
  it('accepts a webhook signed by Stripe, and nothing else', () => {
    const now = Date.UTC(2026, 10, 7, 10);
    const t = Math.floor(now / 1000);
    const body = '{"type":"identity.verification_session.verified"}';
    expect(verifyStripeSignature(body, sign(body, t), secret, now)).toBe(true);
    expect(verifyStripeSignature(`${body} `, sign(body, t), secret, now)).toBe(false);
    expect(verifyStripeSignature(body, sign(body, t - 600), secret, now)).toBe(false);
    expect(verifyStripeSignature(body, null, secret, now)).toBe(false);
  });

  it('P21: reads the verified first and last name, and only the name', () => {
    expect(
      sessionOutcome({
        id: 'vs_1',
        status: 'verified',
        verified_outputs: { first_name: 'Mary', last_name: 'Walsh' },
      }),
    ).toEqual({ status: 'passed', verifiedName: { first: 'Mary', last: 'Walsh' } });
  });

  it('turns Stripe’s failures into Gaff’s three reasons, and notices a declined consent', () => {
    expect(failureReason('selfie_face_mismatch')).toBe('face_mismatch');
    expect(failureReason('document_expired')).toBe('document');
    expect(
      sessionOutcome({
        id: 'vs_1',
        status: 'requires_input',
        last_error: { code: 'consent_declined' },
      }),
    ).toEqual({ status: 'failed', reason: 'gave_up', consentDeclined: true });
    expect(sessionOutcome({ id: 'vs_1', status: 'processing' })).toEqual({ status: 'pending' });
  });

  it('P17, P19: asks for a photo ID and a live selfie, with opaque IDs only', async () => {
    const calls = stubFetch({
      id: 'vs_1',
      status: 'requires_input',
      url: 'https://verify.stripe.com/x',
    });
    const provider = stripeIdentity({ secretKey: 'sk_test' });
    await provider.start({
      checkId: 'c1',
      kind: 'letting',
      returnUrl: 'https://gaff.test/r',
      attempt: 1,
    });
    const body = new URLSearchParams(calls[0]!.body!);
    expect(body.get('options[document][require_matching_selfie]')).toBe('true');
    expect(body.get('options[document][require_live_capture]')).toBe('true');
    expect(body.get('metadata[check_id]')).toBe('c1');
    expect(body.get('metadata[kind]')).toBe('letting');
    expect([...body.keys()].some((k) => /name|email|phone|birth|address/.test(k))).toBe(false);
    expect(calls[0]!.headers['idempotency-key']).toBe('identity-letting-c1-1');
  });

  it('P25: reuses a session that needs another try, as Stripe advises', async () => {
    const calls = stubFetch({
      id: 'vs_1',
      status: 'requires_input',
      url: 'https://verify.stripe.com/again',
    });
    const provider = stripeIdentity({ secretKey: 'sk_test' });
    const started = await provider.start({
      checkId: 'c1',
      kind: 'person',
      returnUrl: 'https://gaff.test/r',
      providerRef: 'vs_1',
      attempt: 2,
    });
    expect(started).toEqual({
      providerRef: 'vs_1',
      redirectUrl: 'https://verify.stripe.com/again',
    });
    expect(calls).toHaveLength(1);
  });

  it('P25: a session that can’t take another try gets a new one', async () => {
    const calls = stubFetch(
      { id: 'vs_1', status: 'canceled', url: null },
      { id: 'vs_2', status: 'requires_input', url: 'https://verify.stripe.com/new' },
    );
    const provider = stripeIdentity({ secretKey: 'sk_test' });
    const started = await provider.start({
      checkId: 'c1',
      kind: 'letting',
      returnUrl: 'https://gaff.test/r',
      providerRef: 'vs_1',
      attempt: 2,
    });
    expect(started).toEqual({ providerRef: 'vs_2', redirectUrl: 'https://verify.stripe.com/new' });
    expect(calls).toHaveLength(2);
  });

  it('P21, P54: reads the outcome from Stripe itself, with the names expanded', async () => {
    const calls = stubFetch({
      id: 'vs_1',
      status: 'verified',
      verified_outputs: { first_name: 'Niamh', last_name: 'Kelly' },
    });
    const outcome = await stripeIdentity({ secretKey: 'sk_test' }).outcome('vs_1');
    expect(outcome).toEqual({ status: 'passed', verifiedName: { first: 'Niamh', last: 'Kelly' } });
    expect(calls[0]!.url).toContain(
      '/identity/verification_sessions/vs_1?expand[]=verified_outputs',
    );
    expect(calls[0]!.headers.authorization).toBe('Bearer sk_test');
  });

  it('P26: asks Stripe to redact a session', async () => {
    const calls = stubFetch({ id: 'vs_1', status: 'canceled' });
    await stripeIdentity({ secretKey: 'sk_test' }).redact('vs_1');
    expect(calls[0]!.url).toMatch(/\/identity\/verification_sessions\/vs_1\/redact$/);
  });

  it('P25: never opens a second session while Stripe is still checking the first', async () => {
    const calls = stubFetch({ id: 'vs_1', status: 'processing', url: null });
    const started = await stripeIdentity({ secretKey: 'sk_test' }).start({
      checkId: 'c1',
      kind: 'letting',
      returnUrl: 'https://gaff.test/checks/done?kind=identity',
      providerRef: 'vs_1',
      attempt: 2,
    });
    expect(started).toEqual({
      providerRef: 'vs_1',
      redirectUrl: 'https://gaff.test/checks/done?kind=identity',
    });
    expect(calls).toHaveLength(1);
  });
});
