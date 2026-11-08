import { and, desc, eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setAiProviderForTests } from '@/adapters/ai';
import { fakeAi } from '@/adapters/ai/fake';
import { db, withOrg } from '@/db/client';
import { devOutbox, events, listingHolds, listings } from '@/db/schema';
import { resetEnvForTests } from '@/lib/env';
import { forgetAiSpend } from '@/server/ai/usage';
import { draftListingDescription } from '@/server/listings/description';
import { saveDescription } from '@/server/listings/editor';
import { heldListings } from '@/server/listings/holds';
import { publishListing } from '@/server/listings/publish';
import { checkLiveListingWording } from '@/server/listings/wording';
import { A_DESCRIPTION, aCheckedLandlord, aListableLetting, aStaffMember } from './listing-helpers';

async function listingOf(organisationId: string, lettingId: string) {
  const [listing] = await withOrg(organisationId, (tx) =>
    tx.select().from(listings).where(eq(listings.lettingId, lettingId)),
  );
  return listing!;
}

async function eventsOf(organisationId: string, type: string) {
  return withOrg(organisationId, (tx) =>
    tx
      .select()
      .from(events)
      .where(and(eq(events.organisationId, organisationId), eq(events.type, type)))
      .orderBy(desc(events.id)),
  );
}

afterEach(() => {
  setAiProviderForTests(undefined);
  vi.unstubAllEnvs();
  resetEnvForTests();
  forgetAiSpend();
});

describe('P10, P11: drafted descriptions', () => {
  it('P10: drafts a description from the facts the letter entered, and logs that it passed', async () => {
    const member = await aCheckedLandlord();
    const { lettingId } = await aListableLetting(member);
    const draft = await draftListingDescription(member, lettingId);
    expect(draft.ok).toBe(true);
    // The stand-in only joins the facts it was given: the home's, never the rent or criteria.
    if (draft.ok) {
      expect(draft.description).toContain('Gas central heating');
      expect(draft.description).not.toMatch(/€|rent|criteria/i);
    }
    const [event] = await eventsOf(member.organisationId, 'listing.description_drafted');
    expect(event?.data).toMatchObject({ accepted: true });
  });

  it('P5: a draft that makes something up is never shown, and the letter writes their own', async () => {
    const member = await aCheckedLandlord();
    const { lettingId } = await aListableLetting(member);
    setAiProviderForTests({
      ...fakeAi,
      draftDescription: async () => ({
        model: 'fake',
        refused: false,
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        output: {
          description: `${A_DESCRIPTION} The Luas is 4 minutes away, and the home has 3 bathrooms.`,
          factIds: [],
        },
      }),
    });
    const draft = await draftListingDescription(member, lettingId);
    expect(draft).toEqual({ ok: false, message: expect.stringContaining('Write your own') });
    const [event] = await eventsOf(member.organisationId, 'listing.description_drafted');
    expect(event?.data).toMatchObject({ accepted: false, problem: 'number_not_in_facts' });
  });

  it('P11: a saved draft stays marked as drafted by AI until the letter changes it', async () => {
    const member = await aCheckedLandlord();
    const { lettingId } = await aListableLetting(member);
    const draft = await draftListingDescription(member, lettingId);
    if (!draft.ok) throw new Error('no draft');
    await saveDescription(member, lettingId, draft.description, draft.description);
    expect((await listingOf(member.organisationId, lettingId)).descriptionSource).toBe('ai_draft');
    await saveDescription(
      member,
      lettingId,
      `${draft.description} Close to the park.`,
      draft.description,
    );
    expect((await listingOf(member.organisationId, lettingId)).descriptionSource).toBe('letter');
  });
});

describe('P12, P13: the wording check', () => {
  it('holds a listing whose words could exclude people, with what was flagged and why', async () => {
    const member = await aCheckedLandlord();
    const { lettingId, description } = await aListableLetting(member);
    await saveDescription(member, lettingId, `${description} It would suit a quiet couple.`);
    const result = await publishListing(member, lettingId, { declare: true });
    expect(result).toMatchObject({ outcome: 'held', reasons: ['unfair_wording'] });
    const listing = await listingOf(member.organisationId, lettingId);
    expect(listing.status).toBe('in_review');
    const [hold] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(listingHolds).where(eq(listingHolds.listingId, listing.id)),
    );
    expect(hold?.wordingFindings).toEqual([
      expect.objectContaining({ phrase: 'quiet couple', ground: 'civil_status' }),
    ]);
    const [flagged] = await eventsOf(member.organisationId, 'listing.wording_flagged');
    expect(flagged?.data).toEqual({
      listingId: listing.id,
      findings: 1,
      grounds: ['civil_status'],
    });
    // A person at Gaff sees the same findings, and decides.
    const staff = await aStaffMember();
    const waiting = (await heldListings(staff)).find((h) => h.lettingId === lettingId);
    expect(waiting?.wordingFindings[0]).toMatchObject({ phrase: 'quiet couple' });
  });

  it('P5: with the check switched off, the word list alone decides and the listing goes live', async () => {
    vi.stubEnv('AI_TASKS_OFF', 'wording');
    resetEnvForTests();
    const member = await aCheckedLandlord();
    const { lettingId, description } = await aListableLetting(member);
    await saveDescription(member, lettingId, `${description} It would suit a quiet couple.`);
    expect((await publishListing(member, lettingId, { declare: true })).outcome).toBe('live');
  });

  it('P12: new words on a live listing are checked straight after the edit', async () => {
    const member = await aCheckedLandlord();
    const { lettingId, description } = await aListableLetting(member);
    expect((await publishListing(member, lettingId, { declare: true })).outcome).toBe('live');
    await saveDescription(member, lettingId, `${description} Tenants must be working.`);
    expect(
      await checkLiveListingWording({ organisationId: member.organisationId, lettingId }),
    ).toBe('held');
    expect((await listingOf(member.organisationId, lettingId)).status).toBe('in_review');
    const mail = await db().select().from(devOutbox).where(eq(devOutbox.toAddress, member.email));
    expect(mail.some((m) => m.subject.includes('waiting for a person at Gaff'))).toBe(true);
  });

  it('P12: a fair edit leaves a live listing as it is', async () => {
    const member = await aCheckedLandlord();
    const { lettingId, description } = await aListableLetting(member);
    await publishListing(member, lettingId, { declare: true });
    await saveDescription(member, lettingId, `${description} Close to the park.`);
    expect(
      await checkLiveListingWording({ organisationId: member.organisationId, lettingId }),
    ).toBe('clear');
    expect((await listingOf(member.organisationId, lettingId)).status).toBe('live');
  });
});
