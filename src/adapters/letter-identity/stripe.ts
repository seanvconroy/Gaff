import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IdentityOutcome, LetterIdentityProvider } from '@/ports/letter-identity';

const API = 'https://api.stripe.com/v1';

function form(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString();
}

/** Stripe's codes for a failed session, in Gaff's three reasons. */
export function failureReason(code: string | undefined): 'document' | 'face_mismatch' | 'gave_up' {
  if (!code || code === 'abandoned' || code === 'consent_declined') return 'gave_up';
  return code.startsWith('selfie_') ? 'face_mismatch' : 'document';
}

interface StripeSession {
  id: string;
  status: 'requires_input' | 'processing' | 'verified' | 'canceled';
  url?: string | null;
  last_error?: { code?: string } | null;
  verified_outputs?: { first_name?: string | null; last_name?: string | null } | null;
}

/** Reads the outcome from a session. Only the names are read; the date of birth is never asked for. */
export function sessionOutcome(session: StripeSession): IdentityOutcome {
  switch (session.status) {
    case 'verified': {
      const name = [session.verified_outputs?.first_name, session.verified_outputs?.last_name]
        .filter(Boolean)
        .join(' ')
        .trim();
      return name ? { status: 'passed', verifiedName: name } : { status: 'pending' };
    }
    case 'requires_input':
      return session.last_error
        ? { status: 'failed', reason: failureReason(session.last_error.code) }
        : { status: 'pending' };
    case 'canceled':
      return { status: 'failed', reason: 'gave_up' };
    default:
      return { status: 'pending' };
  }
}

export function stripeIdentity(config: { secretKey: string }): LetterIdentityProvider {
  const headers = {
    authorization: `Bearer ${config.secretKey}`,
    'content-type': 'application/x-www-form-urlencoded',
  };
  async function call(path: string, init: RequestInit = {}): Promise<StripeSession> {
    const response = await fetch(`${API}${path}`, { ...init, headers });
    if (!response.ok) throw new Error(`Stripe Identity refused: ${response.status}`);
    return (await response.json()) as StripeSession;
  }
  return {
    name: 'stripe',
    async start({ checkId, organisationId, returnUrl }) {
      const session = await call('/identity/verification_sessions', {
        method: 'POST',
        body: form({
          type: 'document',
          'options[document][require_matching_selfie]': 'true',
          'options[document][allowed_types][0]': 'passport',
          'options[document][allowed_types][1]': 'driving_license',
          'options[document][allowed_types][2]': 'id_card',
          return_url: returnUrl,
          'metadata[organisation_id]': organisationId,
          'metadata[check_id]': checkId,
        }),
      });
      if (!session.url) throw new Error('Stripe Identity did not return a link');
      return { providerRef: session.id, redirectUrl: session.url };
    },
    async outcome(providerRef) {
      const session = await call(
        `/identity/verification_sessions/${encodeURIComponent(providerRef)}?expand[]=verified_outputs`,
      );
      return sessionOutcome(session);
    },
    async redact(providerRef) {
      await call(`/identity/verification_sessions/${encodeURIComponent(providerRef)}/redact`, {
        method: 'POST',
      });
    },
  };
}

/**
 * Checks a webhook really came from Stripe: the Stripe-Signature header holds a timestamp and
 * an HMAC of "timestamp.body" with the endpoint's secret. Older than 5 minutes is refused.
 */
export function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  now = Date.now(),
  toleranceSeconds = 300,
): boolean {
  if (!header) return false;
  const parts = header.split(',').map((part) => part.split('=') as [string, string]);
  const timestamp = Number(parts.find(([k]) => k === 't')?.[1]);
  if (!Number.isFinite(timestamp) || Math.abs(now / 1000 - timestamp) > toleranceSeconds) {
    return false;
  }
  const expected = Buffer.from(
    createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex'),
  );
  return parts
    .filter(([k]) => k === 'v1')
    .some(([, v]) => {
      const given = Buffer.from(v ?? '');
      return given.length === expected.length && timingSafeEqual(given, expected);
    });
}
