import { beforeEach, describe, expect, it, vi } from 'vitest';
import { funnels } from '@/domain/funnels/catalogue';
import type * as memberModule from '@/server/auth/member';
import { requireStaff, staffFrom } from '@/server/auth/staff';
import { funnelReportsFor } from '@/server/funnels/report';
import { createTestMember } from './helpers';

type User = { id: string; email: string; emailVerified: boolean };

// Who is signed in comes from the request's session cookie. Here the test says who it is.
const signedIn = vi.hoisted(() => ({ user: null as User | null }));
vi.mock('@/server/auth/member', async (original) => ({
  ...(await original<typeof memberModule>()),
  currentUser: async () => signedIn.user,
}));

/** What Next.js throws for notFound(): the page answers 404. */
const NOT_FOUND = { digest: expect.stringContaining('404') };

const someone = (email: string, emailVerified = true): User => ({
  id: crypto.randomUUID(),
  email,
  emailVerified,
});

describe('UX-ME-2, UX-TS-5: Gaff’s internal page is for Gaff’s own team', () => {
  beforeEach(() => {
    signedIn.user = null;
  });

  it('UX-ME-2: someone who isn’t signed in gets a 404', async () => {
    await expect(requireStaff()).rejects.toMatchObject(NOT_FOUND);
  });

  it('UX-ME-2: a signed-in operator who isn’t staff gets a 404, admins included', async () => {
    const member = await createTestMember();
    expect(member.role).toBe('admin');
    signedIn.user = { id: member.userId, email: member.email, emailVerified: true };
    await expect(requireStaff()).rejects.toMatchObject(NOT_FOUND);
    expect(staffFrom(signedIn.user)).toBeNull();
  });

  it('UX-ME-2: a listed email that was never verified gets a 404', async () => {
    signedIn.user = someone('founder@staff.gaff.test', false);
    expect(staffFrom(signedIn.user)).toBeNull();
    await expect(requireStaff()).rejects.toMatchObject(NOT_FOUND);
  });

  it('UX-ME-2: a signed-in person on STAFF_EMAILS sees every funnel, as totals only', async () => {
    // The address in tests/integration/setup-env.ts, in capitals as someone might type it.
    signedIn.user = someone('Founder@staff.gaff.test');
    const staff = await requireStaff();
    expect(staff.userId).toBe(signedIn.user.id);

    const member = await createTestMember({ organisation: 'Halcyon Lettings' });
    const reports = await funnelReportsFor(staff);
    expect(reports.map((report) => report.code)).toEqual(funnels.map((funnel) => funnel.code));
    const activation = reports.find((report) => report.code === 'activation')!;
    expect(activation.steps[0]!.reached).toBeGreaterThanOrEqual(1);
    // Counts only: nobody's ID, name or email, and no organisation's ID or name.
    const page = JSON.stringify(reports);
    for (const secret of [
      member.userId,
      member.organisationId,
      member.email,
      member.name,
      'Halcyon',
    ]) {
      expect(page).not.toContain(secret);
    }
  });
});
