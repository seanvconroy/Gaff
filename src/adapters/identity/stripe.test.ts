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

describe('P17 to P21: Stripe Identity, once per person', () => {
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

  it('P17, P19: asks for a selfie, or the document alone, with opaque IDs only', async () => {
    const calls = stubFetch({
      id: 'vs_1',
      status: 'requires_input',
      url: 'https://verify.stripe.com/x',
    });
    const provider = stripeIdentity({ secretKey: 'sk_test' });
    await provider.start({
      checkId: 'c1',
      userId: 'u1',
      selfie: false,
      returnUrl: 'https://gaff.test/r',
      attempt: 1,
    });
    const body = new URLSearchParams(calls[0]!.body!);
    expect(body.get('options[document][require_matching_selfie]')).toBe('false');
    expect(body.get('options[document][require_live_capture]')).toBe('true');
    expect(body.get('metadata[check_id]')).toBe('c1');
    expect(body.get('metadata[user_id]')).toBe('u1');
    expect([...body.keys()].some((k) => /name|email|phone/.test(k))).toBe(false);
    expect(calls[0]!.headers['idempotency-key']).toBe('identity-c1-1-d');
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
      userId: 'u1',
      selfie: true,
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
});
