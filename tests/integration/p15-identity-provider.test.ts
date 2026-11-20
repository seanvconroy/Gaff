import { createHmac } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { withOrg, withPerson } from '@/db/client';
import { checks, events, identityChecks, profileEvents } from '@/db/schema';
import { MAX_ATTEMPTS } from '@/domain/identity/attempts';
import { openJson } from '@/lib/crypto';
import { resetEnvForTests } from '@/lib/env';
import { POST as stripeWebhook } from '@/app/api/webhooks/stripe-identity/route';
import { chooseApplicants } from '@/server/applications/choose';
import { recordProviderResult, startProviderCheck } from '@/server/checks/checks';
import { keptIdentityOf } from '@/server/identity/kept';
import { personCheckOf, startPersonCheck } from '@/server/identity/person-checks';
import { settleRenterIdentity } from '@/server/identity/provider-results';
import { redactIdentitySessions } from '@/server/identity/redact';
import { loadRenterPage } from '@/server/renter/answers';
import { renterModelFor } from '@/server/renter/model';
import { createTestMember, type Member, peopleWhoApplied, tokenInMessage } from './helpers';

const WEBHOOK_SECRET = 'whsec_made_up_for_tests';
const stripe = {
  IDENTITY_PROVIDER: 'stripe',
  STRIPE_SECRET_KEY: 'sk_test_made_up',
  STRIPE_IDENTITY_WEBHOOK_SECRET: WEBHOOK_SECRET,
};
const saved: Record<string, string | undefined> = {};

function setEnvironment(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetEnvForTests();
}

/**
 * Stripe, as far as Gaff can see it: each session's state, and every call made. A POST that
 * creates a session opens a new one; a GET reads one; a redact is noted.
 */
function fakeStripe() {
  const sessions = new Map<string, Record<string, unknown>>();
  const calls: Array<{ method: string; url: string; body: string | null }> = [];
  let next = 1;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const body = typeof init.body === 'string' ? init.body : null;
      calls.push({ method, url: input, body });
      const path = new URL(input).pathname;
      const id = /verification_sessions\/([^/?]+)/.exec(path)?.[1];
      if (method === 'POST' && !id) {
        const session = {
          id: `vs_${next++}`,
          status: 'requires_input',
          url: `https://verify.stripe.com/start/${next}`,
        };
        sessions.set(session.id, session);
        return Response.json(session);
      }
      if (method === 'POST' && path.endsWith('/redact')) {
        sessions.set(id!, { ...sessions.get(id!), status: 'canceled', redacted: true });
        return Response.json(sessions.get(id!));
      }
      const session = sessions.get(id!);
      return session ? Response.json(session) : new Response('{}', { status: 404 });
    }),
  );
  return {
    calls,
    set: (id: string, values: Record<string, unknown>) =>
      sessions.set(id, { ...sessions.get(id), ...values }),
  };
}

/** A webhook as Stripe signs it, or with a wrong signature. */
function webhook(event: unknown, secret = WEBHOOK_SECRET) {
  const payload = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  return stripeWebhook(
    new Request('http://localhost:3000/api/webhooks/stripe-identity', {
      method: 'POST',
      headers: { 'stripe-signature': `t=${t},v1=${v1}` },
      body: payload,
    }),
  );
}

const sessionEvent = (type: string, sessionId: string, checkId: string, extra = {}) => ({
  type: `identity.verification_session.${type}`,
  data: {
    object: { id: sessionId, metadata: { check_id: checkId, kind: 'letting' }, ...extra },
  },
});

/** An agency's letting with its preferred applicant chosen, and their checks link. */
async function chosen() {
  const member = await createTestMember();
  const { lettingId, ids } = await peopleWhoApplied(member, [5200, 4800]);
  await chooseApplicants(member, lettingId, { preferredId: ids[0]!, backupId: ids[1]! });
  const token = await tokenInMessage(member, ids[0]!, 'checks_invitation');
  return { member, lettingId, applicationId: ids[0]!, token };
}

async function idCheckOf(member: Member, applicationId: string) {
  const [row] = await withOrg(member.organisationId, (tx) =>
    tx
      .select()
      .from(checks)
      .where(and(eq(checks.applicationId, applicationId), eq(checks.kind, 'identity'))),
  );
  return row!;
}

describe('P25: three tries at an ID check (any provider)', () => {
  it('P25: a letting’s ID check can be started three times; then the renter is shown how to reach a person', async () => {
    const { member, applicationId, token } = await chosen();
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const started = await startProviderCheck(token, 'identity');
      expect('redirectUrl' in started).toBe(true);
      const check = await idCheckOf(member, applicationId);
      expect(check.attempts).toBe(attempt);
      expect(check.consentVersion).toBe('id_check_notice_v1');
      await recordProviderResult(check.id, {
        kind: 'identity',
        result: { verified: false, reason: 'face_mismatch' },
      });
    }
    expect(await startProviderCheck(token, 'identity')).toEqual({ problem: 'no_attempts_left' });
    const page = await loadRenterPage(token);
    const identity = renterModelFor(page!).checks.items.find((item) => item.kind === 'identity');
    expect(identity).toMatchObject({ status: 'not_passed', noTriesLeft: true });
  });

  it('P18: saying no on the provider’s own consent screen isn’t one of the three', async () => {
    const { member, applicationId, token } = await chosen();
    await startProviderCheck(token, 'identity');
    const check = await idCheckOf(member, applicationId);
    await recordProviderResult(check.id, {
      kind: 'identity',
      result: { verified: false, reason: 'gave_up', consentDeclined: true },
    });
    expect((await idCheckOf(member, applicationId)).attempts).toBe(0);
  });

  it('P25: a private landlord’s own check has three tries too, in one row', async () => {
    const member = await createTestMember({ kind: 'private_landlord', confirmed: false });
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const started = await startPersonCheck(member.userId, 'go_live', '/lettings');
      const id = /\/dev\/checks\/([0-9a-f-]{36})/.exec(
        'redirectUrl' in started ? started.redirectUrl : '',
      )![1]!;
      await recordProviderResult(id, {
        kind: 'identity',
        result: { verified: false, reason: 'document' },
      });
    }
    const rows = await withPerson(member.userId, (tx) =>
      tx.select().from(identityChecks).where(eq(identityChecks.userId, member.userId)),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ attempts: MAX_ATTEMPTS, status: 'not_passed' });
    expect(await personCheckOf(member.userId)).toEqual({
      status: 'not_passed',
      reason: 'document',
      noTriesLeft: true,
    });
    expect(await startPersonCheck(member.userId, 'go_live', '/lettings')).toEqual({
      problem: 'no_attempts_left',
    });
  });
});

describe('P17 to P26, P54: the ID check on Stripe Identity', () => {
  beforeAll(() => {
    for (const key of Object.keys(stripe)) saved[key] = process.env[key];
    setEnvironment(stripe);
  });
  afterAll(() => setEnvironment(saved));
  afterEach(() => vi.unstubAllGlobals());

  it('P17, P25: sends the renter to Stripe with opaque IDs, and reuses the one session for another try', async () => {
    const fake = fakeStripe();
    const { member, applicationId, token } = await chosen();
    const started = await startProviderCheck(token, 'identity');
    expect(started).toEqual({
      redirectUrl: expect.stringMatching(/^https:\/\/verify\.stripe\.com\//),
    });
    const check = await idCheckOf(member, applicationId);
    expect(check).toMatchObject({ provider: 'stripe', providerRef: 'vs_1', attempts: 1 });
    const created = new URLSearchParams(fake.calls[0]!.body!);
    expect(created.get('metadata[check_id]')).toBe(check.id);
    expect(created.get('metadata[kind]')).toBe('letting');
    expect(created.get('return_url')).toBe('http://localhost:3000/checks/done?kind=identity');
    expect(fake.calls[0]!.body).not.toContain(token);

    // It didn't pass; the next try opens the same session again.
    fake.set('vs_1', { last_error: { code: 'selfie_face_mismatch' } });
    expect((await webhook(sessionEvent('requires_input', 'vs_1', check.id))).status).toBe(200);
    expect(await idCheckOf(member, applicationId)).toMatchObject({
      status: 'not_passed',
      reason: 'face_mismatch',
    });
    await startProviderCheck(token, 'identity');
    expect(await idCheckOf(member, applicationId)).toMatchObject({
      providerRef: 'vs_1',
      attempts: 2,
      status: 'in_progress',
    });
    expect(fake.calls.filter((c) => c.method === 'POST' && !/vs_/.test(c.url))).toHaveLength(1);
  });

  it('P54: a webhook without Stripe’s signature is refused, and changes nothing', async () => {
    const fake = fakeStripe();
    const { member, applicationId, token } = await chosen();
    await startProviderCheck(token, 'identity');
    const check = await idCheckOf(member, applicationId);
    fake.set('vs_1', {
      status: 'verified',
      verified_outputs: { first_name: 'Renter', last_name: 'One' },
    });
    const forged = await webhook(sessionEvent('verified', 'vs_1', check.id), 'whsec_someone_else');
    expect(forged.status).toBe(400);
    const unsigned = await stripeWebhook(
      new Request('http://localhost:3000/api/webhooks/stripe-identity', {
        method: 'POST',
        body: JSON.stringify(sessionEvent('verified', 'vs_1', check.id)),
      }),
    );
    expect(unsigned.status).toBe(400);
    expect((await idCheckOf(member, applicationId)).status).toBe('in_progress');
  });

  it('P54: a “verified” that Stripe’s own session contradicts is refused; so is a session the check doesn’t hold', async () => {
    const fake = fakeStripe();
    const { member, applicationId, token } = await chosen();
    await startProviderCheck(token, 'identity');
    const check = await idCheckOf(member, applicationId);
    // Signed, and it says verified with a name in it; Stripe says the session still needs input.
    const claim = sessionEvent('verified', 'vs_1', check.id, {
      status: 'verified',
      verified_outputs: { first_name: 'Someone', last_name: 'Else' },
    });
    expect(await (await webhook(claim)).json()).toEqual({ ok: true, result: 'ignored' });
    expect((await idCheckOf(member, applicationId)).status).toBe('in_progress');
    // A real, verified session that belongs to something else isn't this check's.
    const other = fakeStripe();
    other.set('vs_9', {
      id: 'vs_9',
      status: 'verified',
      verified_outputs: { first_name: 'Someone', last_name: 'Else' },
    });
    expect(await (await webhook(sessionEvent('verified', 'vs_9', check.id))).json()).toEqual({
      ok: true,
      result: 'ignored',
    });
    expect((await idCheckOf(member, applicationId)).status).toBe('in_progress');
    expect(fake.calls.some((c) => c.url.includes('verified_outputs'))).toBe(true);
  });

  it('P21, P54: a verified session is recorded from Stripe’s own answer: the name, sealed, and the date', async () => {
    const fake = fakeStripe();
    const { member, applicationId, token } = await chosen();
    await startProviderCheck(token, 'identity');
    const check = await idCheckOf(member, applicationId);
    fake.set('vs_1', {
      status: 'verified',
      verified_outputs: { first_name: 'Renter', last_name: 'One' },
    });
    expect(await (await webhook(sessionEvent('verified', 'vs_1', check.id))).json()).toEqual({
      ok: true,
      result: 'recorded',
    });
    const passed = await idCheckOf(member, applicationId);
    expect(passed.status).toBe('passed');
    expect(openJson<{ verifiedName: string }>(passed.resultSealed!).verifiedName).toBe(
      'Renter One',
    );
    // P26: Stripe deletes the images 30 days after the result.
    const days = (passed.redactAfter!.getTime() - passed.completedAt!.getTime()) / 86_400_000;
    expect(days).toBe(30);
    // A second delivery of the same event changes nothing.
    expect(await (await webhook(sessionEvent('verified', 'vs_1', check.id))).json()).toEqual({
      ok: true,
      result: 'ignored',
    });
  });

  it('P21: back from Stripe’s pages, the result is read from Stripe if the webhook is late', async () => {
    const fake = fakeStripe();
    const { member, applicationId, token } = await chosen();
    await startProviderCheck(token, 'identity');
    fake.set('vs_1', { status: 'processing' });
    await settleRenterIdentity(token);
    expect((await idCheckOf(member, applicationId)).status).toBe('in_progress');
    fake.set('vs_1', {
      status: 'verified',
      verified_outputs: { first_name: 'Renter', last_name: 'One' },
    });
    await settleRenterIdentity(token);
    expect((await idCheckOf(member, applicationId)).status).toBe('passed');
  });

  it('P26: 30 days after the result, the retention job has Stripe redact it, and logs that with IDs only', async () => {
    const fake = fakeStripe();
    const { member, applicationId, token } = await chosen();
    await startProviderCheck(token, 'identity');
    const check = await idCheckOf(member, applicationId);
    fake.set('vs_1', {
      status: 'verified',
      verified_outputs: { first_name: 'Renter', last_name: 'One' },
    });
    await webhook(sessionEvent('verified', 'vs_1', check.id));
    const soon = new Date(Date.now() + 29 * 86_400_000);
    await redactIdentitySessions(soon);
    expect((await idCheckOf(member, applicationId)).providerRedactedAt).toBeNull();

    const later = new Date(Date.now() + 31 * 86_400_000);
    await redactIdentitySessions(later);
    const redacted = await idCheckOf(member, applicationId);
    expect(redacted.providerRedactedAt).toEqual(later);
    expect(redacted.providerRef).toBeNull();
    expect(
      fake.calls.some((c) => c.url.endsWith('/identity/verification_sessions/vs_1/redact')),
    ).toBe(true);
    const logged = await withOrg(member.organisationId, (tx) =>
      tx
        .select({ data: events.data })
        .from(events)
        .where(and(eq(events.type, 'check.redacted'), eq(events.subjectId, check.id))),
    );
    expect(logged.map((e) => e.data)).toEqual([{ checkId: check.id }]);
  });

  it('P26, Q47: a private landlord’s own check passes through Stripe, is kept, and goes once Stripe has redacted it', async () => {
    const fake = fakeStripe();
    const member = await createTestMember({
      kind: 'private_landlord',
      name: 'Mary Byrne',
      confirmed: false,
    });
    const started = await startPersonCheck(member.userId, 'go_live', '/lettings');
    expect(started).toEqual({
      redirectUrl: expect.stringMatching(/^https:\/\/verify\.stripe\.com\//),
    });
    const [row] = await withPerson(member.userId, (tx) =>
      tx.select().from(identityChecks).where(eq(identityChecks.userId, member.userId)),
    );
    expect(new URLSearchParams(fake.calls[0]!.body!).get('metadata[kind]')).toBe('person');
    fake.set(row!.providerRef!, {
      status: 'verified',
      verified_outputs: { first_name: 'Mary', last_name: 'Byrne' },
    });
    const event = {
      type: 'identity.verification_session.verified',
      data: { object: { id: row!.providerRef, metadata: { check_id: row!.id, kind: 'person' } } },
    };
    expect(await (await webhook(event)).json()).toEqual({ ok: true, result: 'recorded' });
    expect(await keptIdentityOf(member.userId)).toMatchObject({ verifiedName: 'Mary Byrne' });
    expect(await personCheckOf(member.userId)).toBeNull();

    await redactIdentitySessions(new Date(Date.now() + 31 * 86_400_000));
    const left = await withPerson(member.userId, (tx) =>
      tx.select().from(identityChecks).where(eq(identityChecks.userId, member.userId)),
    );
    expect(left).toEqual([]);
    const logged = await withPerson(member.userId, (tx) =>
      tx
        .select({ type: profileEvents.type, data: profileEvents.data })
        .from(profileEvents)
        .where(eq(profileEvents.userId, member.userId)),
    );
    expect(logged).toContainEqual({
      type: 'profile.identity_check_redacted',
      data: { identityCheckId: row!.id },
    });
  });

  it('P54: the webhook is “not found” unless Stripe is the ID provider', async () => {
    setEnvironment({ IDENTITY_PROVIDER: 'stand_in' });
    const answer = await webhook({ type: 'identity.verification_session.verified' });
    expect(answer.status).toBe(404);
    setEnvironment(stripe);
  });
});
