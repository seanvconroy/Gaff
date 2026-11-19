import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetEnvForTests } from '@/lib/env';
import type * as checksModule from '@/server/checks/checks';
import type * as memberModule from '@/server/auth/member';
import { signInProviderModes } from '@/server/auth/auth';
import StandInCheckPage from '@/app/dev/checks/[checkId]/page';
import { standInResultAction } from '@/app/dev/checks/[checkId]/actions';
import DevInboundPage from '@/app/dev/inbound/page';
import { simulateInboundEmail } from '@/app/dev/inbound/actions';
import DevOutboxPage from '@/app/dev/outbox/page';
import StandInSignInPage from '@/app/dev/sign-in/[provider]/page';
import { POST as standInAnswer } from '@/app/dev/sign-in/[provider]/answer/route';
import { createTestMember } from './helpers';

type User = { id: string; email: string; emailVerified: boolean };

// Who is signed in comes from the request's session cookie. Here the test says who it is.
const signedIn = vi.hoisted(() => ({ user: null as User | null }));
vi.mock('@/server/auth/member', async (original) => ({
  ...(await original<typeof memberModule>()),
  currentUser: async () => signedIn.user,
}));

// A made-up check for the stand-in check page, so staff see the page itself.
const madeUpCheck = vi.hoisted(() => ({ id: '' }));
vi.mock('@/server/checks/checks', async (original) => {
  const real = await original<typeof checksModule>();
  return {
    ...real,
    standInCheck: async (checkId: string) =>
      checkId === madeUpCheck.id
        ? {
            check: { id: checkId, kind: 'identity' },
            application: { fullName: 'Ann Power', monthlyIncomeCents: null },
          }
        : real.standInCheck(checkId),
  };
});

/** What Next.js throws for notFound(): the page answers 404. */
const NOT_FOUND = { digest: expect.stringContaining('404') };
const REDIRECT = { digest: expect.stringContaining('NEXT_REDIRECT') };

/** The deployed test copy: staging, with real email through Resend and a send-only key. */
const testCopy = {
  GAFF_ENV: 'staging',
  DEV_TOOLS: undefined,
  EMAIL_PROVIDER: 'resend',
  RESEND_API_KEY: 're_made_up_send_only',
  RESEND_WEBHOOK_SECRET: undefined,
  CRON_SECRET: 'ba1-cron-secret-at-least-16-characters',
  STAFF_EMAILS: 'founder@staff.gaff.test',
  // The deployed project's older name for the same list.
  TEST_STAFF_EMAILS: 'tester@staff.gaff.test',
};
const saved: Record<string, string | undefined> = {};

function setEnvironment(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetEnvForTests();
}

const someone = (email: string, emailVerified = true): User => ({
  id: crypto.randomUUID(),
  email,
  emailVerified,
});

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

/** Every page and action under /dev that shows or changes something. */
const devTools = {
  'the outbox': () => DevOutboxPage(),
  'the test inbox': () => DevInboundPage({ searchParams: Promise.resolve({}) }),
  'sending to the test inbox': () =>
    simulateInboundEmail(
      form({ to: 'nobody@in.gaff.test', from: 'x@daft.ie', subject: 'Hi', text: 'Hi' }),
    ),
  'the stand-in check': () =>
    StandInCheckPage({
      params: Promise.resolve({ checkId: madeUpCheck.id }),
      searchParams: Promise.resolve({}),
    }),
  'choosing a stand-in check’s result': () =>
    standInResultAction(crypto.randomUUID(), 'identity', '/checks/done', form({ outcome: 'pass' })),
};

describe('BA-1: the test copy on a public address', () => {
  beforeAll(() => {
    for (const key of Object.keys(testCopy)) saved[key] = process.env[key];
    madeUpCheck.id = crypto.randomUUID();
    setEnvironment(testCopy);
  });
  afterAll(() => setEnvironment(saved));
  beforeEach(() => {
    signedIn.user = null;
  });

  for (const [name, open] of Object.entries(devTools)) {
    it(`BA-1: ${name} is "not found" for a visitor who isn’t signed in`, async () => {
      await expect(open()).rejects.toMatchObject(NOT_FOUND);
    });

    it(`BA-1: ${name} is "not found" for a signed-in person who isn’t on Gaff’s team`, async () => {
      const member = await createTestMember();
      signedIn.user = { id: member.userId, email: member.email, emailVerified: true };
      await expect(open()).rejects.toMatchObject(NOT_FOUND);
      // A listed address that was never verified is nobody's.
      signedIn.user = someone('founder@staff.gaff.test', false);
      await expect(open()).rejects.toMatchObject(NOT_FOUND);
    });

    it(`BA-1: ${name} opens for Gaff’s own team, from STAFF_EMAILS or TEST_STAFF_EMAILS`, async () => {
      for (const email of ['founder@staff.gaff.test', 'Tester@staff.gaff.test']) {
        signedIn.user = someone(email);
        const answer = await open().then(
          (page) => ({ page }),
          (error: unknown) => ({ error }),
        );
        // A page renders; an action does its work and goes on to the next page.
        if ('error' in answer) expect(answer.error).toMatchObject(REDIRECT);
        else expect(answer.page).toBeTruthy();
      }
    });
  }

  it('BA-1, AU1: the Google and Apple stand-in doesn’t exist, for anyone, staff included', async () => {
    expect(signInProviderModes()).toEqual({ google: 'off', apple: 'off' });
    const callback = 'http://localhost:3000/api/auth/callback/google';
    for (const user of [null, someone('founder@staff.gaff.test')]) {
      signedIn.user = user;
      await expect(
        StandInSignInPage({
          params: Promise.resolve({ provider: 'google' }),
          searchParams: Promise.resolve({ state: 'made-up', redirect_uri: callback }),
        }),
      ).rejects.toMatchObject(NOT_FOUND);
      const answer = await standInAnswer(
        new Request('http://localhost:3000/dev/sign-in/google/answer', {
          method: 'POST',
          body: form({ state: 'made-up', name: 'Ann Power', email: 'founder@staff.gaff.test' }),
        }) as never,
        { params: Promise.resolve({ provider: 'google' }) },
      );
      expect(answer.status).toBe(404);
    }
  });
});

describe('BA-1: local development and tests stay as they are', () => {
  const before = { DEV_TOOLS: process.env.DEV_TOOLS };
  beforeAll(() => setEnvironment({ DEV_TOOLS: '1' }));
  afterAll(() => setEnvironment(before));

  it('opens the outbox to whoever runs Gaff, where every email is in it', async () => {
    signedIn.user = null;
    expect(await DevOutboxPage()).toBeTruthy();
    expect(signInProviderModes()).toEqual({ google: 'stand_in', apple: 'stand_in' });
  });
});
