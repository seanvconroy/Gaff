import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { failureReason, sessionOutcome, verifyStripeSignature } from './stripe';

const secret = 'whsec_test_secret';
const sign = (payload: string, t: number) =>
  `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')}`;

describe('M24: Stripe Identity', () => {
  it('accepts a webhook signed by Stripe, and nothing else', () => {
    const now = Date.UTC(2026, 10, 7, 10);
    const t = Math.floor(now / 1000);
    const body = '{"type":"identity.verification_session.verified"}';
    expect(verifyStripeSignature(body, sign(body, t), secret, now)).toBe(true);
    expect(verifyStripeSignature(`${body} `, sign(body, t), secret, now)).toBe(false);
    expect(verifyStripeSignature(body, sign(body, t - 600), secret, now)).toBe(false);
    expect(verifyStripeSignature(body, null, secret, now)).toBe(false);
    expect(verifyStripeSignature(body, 't=abc,v1=00', secret, now)).toBe(false);
  });

  it('reads the verified name, and only the name', () => {
    expect(
      sessionOutcome({
        id: 'vs_1',
        status: 'verified',
        verified_outputs: { first_name: 'Mary', last_name: 'Walsh' },
      }),
    ).toEqual({ status: 'passed', verifiedName: 'Mary Walsh' });
  });

  it('turns Stripe’s failures into Gaff’s three reasons', () => {
    expect(failureReason('selfie_face_mismatch')).toBe('face_mismatch');
    expect(failureReason('document_expired')).toBe('document');
    expect(failureReason('consent_declined')).toBe('gave_up');
    expect(
      sessionOutcome({ id: 'vs_1', status: 'requires_input', last_error: { code: 'abandoned' } }),
    ).toEqual({ status: 'failed', reason: 'gave_up' });
    expect(sessionOutcome({ id: 'vs_1', status: 'processing' })).toEqual({ status: 'pending' });
  });
});
