import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withOrg } from '@/db/client';
import { inboundEmails, organisations } from '@/db/schema';
import { receiveInboundEmail } from '@/server/enquiries/receive';
import { createTestMember, queuedJobs } from './helpers';

async function gaffAddressOf(organisationId: string) {
  const [org] = await db()
    .select({ slug: organisations.inboundSlug })
    .from(organisations)
    .where(eq(organisations.id, organisationId));
  return `${org!.slug}@in.gaff.test`;
}

const anEmail = (recipient: string, id = crypto.randomUUID()) => ({
  provider: 'dev' as const,
  providerMessageId: `<${id}@daft.ie>`,
  recipient,
  from: 'Daft.ie <noreply@daft.ie>',
  subject: 'New enquiry',
  text: 'Synthetic test email',
  receivedAt: new Date(),
});

describe('R5: receiving at a Gaff address', () => {
  it('stores the email first and queues it for reading, in one transaction', async () => {
    const member = await createTestMember();
    const email = anEmail(await gaffAddressOf(member.organisationId));
    expect(await receiveInboundEmail(email)).toBe('stored');
    const stored = await withOrg(member.organisationId, (tx) => tx.select().from(inboundEmails));
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ status: 'received', subject: 'New enquiry' });
    const jobs = await queuedJobs('process_inbound_email');
    expect(jobs.filter((job) => job.inboundEmailId === stored[0]!.id)).toHaveLength(1);
  });

  it('ignores the same email delivered twice', async () => {
    const member = await createTestMember();
    const email = anEmail(await gaffAddressOf(member.organisationId));
    expect(await receiveInboundEmail(email)).toBe('stored');
    expect(await receiveInboundEmail(email)).toBe('duplicate');
  });

  it('refuses addresses that aren’t an organisation’s Gaff address', async () => {
    expect(await receiveInboundEmail(anEmail('nobody@in.gaff.test'))).toBe('unknown_recipient');
    expect(await receiveInboundEmail(anEmail('someone@elsewhere.ie'))).toBe('unknown_recipient');
  });

  it('accepts replies to a thread address (slug+ref) for the same organisation', async () => {
    const member = await createTestMember();
    const address = (await gaffAddressOf(member.organisationId)).replace('@', '+abc123@');
    expect(await receiveInboundEmail(anEmail(address))).toBe('stored');
  });
});
