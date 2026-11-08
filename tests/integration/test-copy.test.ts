import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { databaseStorage } from '@/adapters/storage/database';
import { verifyLocalUpload } from '@/adapters/storage/local';
import { db, withOrg } from '@/db/client';
import { applications, platformEvents, staffMembers, users } from '@/db/schema';
import { findStaff } from '@/server/auth/staff';
import { addTestEnquiries } from '@/server/dev/test-enquiries';
import {
  addTester,
  isListedTester,
  makeListedTesterStaff,
  removeTester,
} from '@/server/staff/testers';
import { aLiveLetting, createTestMember } from './helpers';
import { aStaffMember } from './listing-helpers';

async function aUser(email: string): Promise<string> {
  const id = crypto.randomUUID();
  await db().insert(users).values({ id, name: 'Test person', email, emailVerified: true });
  return id;
}

async function anAdmin() {
  const id = await aUser(`${crypto.randomUUID()}@testers.gaff.test`);
  await db().insert(staffMembers).values({ userId: id, role: 'admin' });
  return (await findStaff(id))!;
}

describe('Test copy: testers are Gaff staff', () => {
  it('makes the listed founders admins when they sign in, and nobody else', async () => {
    const listed = `${crypto.randomUUID()}@founders.gaff.test`;
    const founder = await aUser(listed);
    const other = await aUser(`${crypto.randomUUID()}@founders.gaff.test`);
    const list = `someone@else.test, ${listed.toUpperCase()}`;
    await makeListedTesterStaff(founder, { gaffEnv: 'staging', list });
    await makeListedTesterStaff(founder, { gaffEnv: 'staging', list });
    await makeListedTesterStaff(other, { gaffEnv: 'staging', list });
    expect((await findStaff(founder))?.role).toBe('admin');
    expect(await findStaff(other)).toBeNull();
    const events = await db()
      .select()
      .from(platformEvents)
      .where(and(eq(platformEvents.type, 'staff.added'), eq(platformEvents.actorType, 'system')));
    expect(events.some((e) => JSON.stringify(e.data).includes(listed))).toBe(false);
  });

  it('never does it in production', async () => {
    const listed = `${crypto.randomUUID()}@founders.gaff.test`;
    const founder = await aUser(listed);
    await makeListedTesterStaff(founder, { gaffEnv: 'production', list: listed });
    expect(await findStaff(founder)).toBeNull();
  });

  it('matches whole addresses, so "you+renter@" stays an ordinary account', () => {
    expect(isListedTester('Ann@Example.com', 'ann@example.com')).toBe(true);
    expect(isListedTester('ann+renter@example.com', 'ann@example.com')).toBe(false);
  });

  it('lets an admin add someone who has signed in, and remove them, but not themselves', async () => {
    const admin = await anAdmin();
    const partnerEmail = `${crypto.randomUUID()}@partner.gaff.test`;
    expect(await addTester(admin, { email: partnerEmail, role: 'admin' })).toBe('no_account');
    const partner = await aUser(partnerEmail);
    expect(await addTester(admin, { email: partnerEmail, role: 'reviewer' })).toBe('added');
    expect((await findStaff(partner))?.role).toBe('reviewer');
    expect(await removeTester(admin, admin.userId)).toBe('not_allowed');
    expect(await removeTester(admin, partner)).toBe('removed');
    expect(await findStaff(partner)).toBeNull();
  });

  it('lets only admins change testers', async () => {
    const reviewer = await aStaffMember();
    const someone = `${crypto.randomUUID()}@partner.gaff.test`;
    await aUser(someone);
    expect(await addTester(reviewer, { email: someone, role: 'admin' })).toBe('not_allowed');
  });
});

describe('Test copy: photos kept in the database', () => {
  const storage = databaseStorage({ appUrl: 'http://localhost:3000', secret: 'x'.repeat(40) });

  it('writes, reads, replaces and removes objects, and signs uploads like the local stand-in', async () => {
    const key = `${crypto.randomUUID()}/480.webp`;
    await storage.write('media', key, Buffer.from('one'), 'image/webp');
    await storage.write('media', key, Buffer.from('two'), 'image/webp');
    expect((await storage.read('media', key))?.toString()).toBe('two');
    expect(await storage.read('uploads', key)).toBeNull();
    await storage.remove('media', [key]);
    expect(await storage.read('media', key)).toBeNull();

    const upload = await storage.signedUpload(`${crypto.randomUUID()}/original`, 'image/jpeg');
    const url = new URL(upload.url);
    expect(url.pathname).toBe('/api/dev/storage/upload');
    expect(
      verifyLocalUpload('x'.repeat(40), {
        key: url.searchParams.get('key')!,
        contentType: url.searchParams.get('type')!,
        expires: Number(url.searchParams.get('expires')),
        token: url.searchParams.get('token')!,
      }),
    ).toBe(true);
    expect(storage.publicUrl('abc/480.webp')).toBe(
      'http://localhost:3000/api/dev/storage/media/abc/480.webp',
    );
    expect(() => storage.publicUrl('../secrets')).toThrow();
  });
});

describe('Test copy: made-up renters enquire', () => {
  it('adds five enquiries from Daft and MyHome, most with answers, from made-up addresses', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    expect(await addTestEnquiries(member, lettingId, 5)).toEqual({ added: 5, answered: 4 });
    const rows = await withOrg(member.organisationId, (tx) =>
      tx
        .select({ sources: applications.sources, email: applications.email })
        .from(applications)
        .where(eq(applications.lettingId, lettingId)),
    );
    expect(rows).toHaveLength(5);
    expect(new Set(rows.flatMap((r) => r.sources))).toEqual(new Set(['daft', 'myhome']));
    for (const row of rows) expect(row.email).toMatch(/@example\.ie$/);
    // Five more are new people, not repeats of the first five.
    expect(await addTestEnquiries(member, lettingId, 5)).toMatchObject({ added: 5 });
  });
});
