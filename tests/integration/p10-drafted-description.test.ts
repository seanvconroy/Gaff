import { and, desc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAiProviderForTests } from '@/adapters/ai';
import { fakeAi, fakeAiWith } from '@/adapters/ai/fake';
import { db, withOrg } from '@/db/client';
import { aiCalls, events, lettings } from '@/db/schema';
import { env, resetEnvForTests } from '@/lib/env';
import type { AiProvider, DescriptionRequest } from '@/ports/ai';
import { forgetAiSpend } from '@/server/ai/usage';
import {
  descriptionDraftingIsOffered,
  draftDescription,
  isGaffsDraft,
} from '@/server/lettings/drafted-description';
import { loadHome, saveAnswers, startDraft } from '@/server/lettings/drafts';
import { daftEnquiry } from '../fixtures/emails';
import { daysFromToday } from '../fixtures/lettings';
import { aLiveLetting, createTestMember, deliverEmail, type Member } from './helpers';

/**
 * The live line's P10 and P11: "Draft a description" drafts a home's description from its facts
 * and the lister's own statements, never the rent, the criteria or anyone's details. A draft
 * that fails Gaff's checks is never shown, and one saved as drafted is marked until the lister
 * changes its words.
 */

const address = {
  addressLine1: '12 Ranelagh Road',
  area: 'Ranelagh, Dublin 6',
  county: 'Dublin',
  eircode: 'D06 F2X3',
} as const;

/** The stand-in, watched: every request the model would have been sent. */
function watchedAi(provider: AiProvider = fakeAi) {
  const sent: DescriptionRequest[] = [];
  const ai = {
    ...provider,
    draftDescription: vi.fn(async (request: DescriptionRequest) => {
      sent.push(request);
      return provider.draftDescription(request);
    }),
  };
  setAiProviderForTests(ai);
  return { ai, sent };
}

async function drafted(member: Member, lettingId: string) {
  const rows = await withOrg(member.organisationId, (tx) =>
    tx
      .select({ data: events.data, actorType: events.actorType })
      .from(events)
      .where(
        and(eq(events.lettingId, lettingId), eq(events.type, 'letting.description_drafted')),
      )
      .orderBy(desc(events.id)),
  );
  return rows;
}

async function markOf(member: Member, lettingId: string) {
  const [row] = await withOrg(member.organisationId, (tx) =>
    tx
      .select({ description: lettings.description, byAi: lettings.descriptionByAi })
      .from(lettings)
      .where(eq(lettings.id, lettingId)),
  );
  return row!;
}

beforeEach(() => forgetAiSpend());
afterEach(() => {
  setAiProviderForTests(undefined);
  vi.unstubAllEnvs();
  resetEnvForTests();
  forgetAiSpend();
});

describe('P10: what the model is given', () => {
  it('P10: drafts from the home’s facts and the lister’s statements, never the rent, the criteria or anyone’s details', async () => {
    const member = await createTestMember({ name: 'Niamh Kelleher' });
    const { lettingId } = await aLiveLetting(member, {
      otherFacts: [
        'Gas central heating',
        'Ask Mary Byrne or Niamh Kelleher on 086 555 0199 about the bins',
        'Email niamh@example.ie for a key',
      ].join('\n'),
    });
    // A renter has enquired: nothing about them goes anywhere near the draft.
    expect((await deliverEmail(member, daftEnquiry)).kind).toBe('enquiry');
    const { sent } = watchedAi();

    const draft = await draftDescription(member, lettingId);
    expect(draft.ok).toBe(true);
    if (draft.ok) expect(draft.description).toContain('Gas central heating');

    expect(sent).toHaveLength(1);
    const given = JSON.stringify(sent[0]);
    expect(given).toContain('Area: Ranelagh, Dublin 6, Dublin');
    expect(given).toContain('Type: Apartment');
    for (const never of [
      '1,850',
      '1850',
      '185000',
      '€',
      'rent',
      'pets',
      'occupants',
      '12 Ranelagh Road',
      'D06',
      'daft.ie',
      'Mary',
      'Niamh',
      'Kelleher',
      '086',
      'niamh@example.ie',
      'Aoife',
      'aoife.byrne',
      '087 123 4567',
      member.organisationName,
    ]) {
      expect(given, never).not.toContain(never);
    }
    const [event] = await drafted(member, lettingId);
    expect(event).toEqual({ data: { accepted: true }, actorType: 'person' });
  });

  it('P10: uses the facts on the screen before they are saved, and asks for the type or bedrooms first', async () => {
    const member = await createTestMember();
    const { id } = await startDraft(member, { origin: 'manual' });
    await saveAnswers(member, id, { step: 'address', patch: address, advance: true });
    await saveAnswers(member, id, {
      step: 'rent',
      patch: { rentCents: 185_000, availableFrom: daysFromToday(30) },
      advance: true,
    });
    const { sent } = watchedAi();
    expect(await draftDescription(member, id, {})).toEqual({ ok: false, reason: 'needs_facts' });
    expect(sent).toHaveLength(0);

    const draft = await draftDescription(member, id, {
      propertyType: 'house',
      bedrooms: '3',
      otherFacts: 'A garden to the back',
      description: 'Words already in the field are never sent',
    });
    expect(draft.ok).toBe(true);
    const given = JSON.stringify(sent[0]);
    expect(given).toContain('Type: House');
    expect(given).toContain('Bedrooms: 3');
    expect(given).toContain('A garden to the back');
    expect(given).not.toContain('never sent');
  });
});

describe('P11: a draft is used only if it passes the checks', () => {
  it('P11: a draft that makes something up is never shown, and the lister writes their own', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    const invents = fakeAiWith({
      draftDescription: async (request) => {
        const reply = await fakeAi.draftDescription(request);
        return {
          ...reply,
          output: {
            ...reply.output!,
            description: `${reply.output!.description} The Luas is 4 minutes away.`,
          },
        };
      },
    });
    setAiProviderForTests(invents);
    expect(await draftDescription(member, lettingId)).toEqual({ ok: false, reason: 'unavailable' });
    const [event] = await drafted(member, lettingId);
    expect(event?.data).toEqual({ accepted: false, problem: 'number_not_in_facts' });
  });

  it('P11: a draft that says who the home would suit is never shown', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    setAiProviderForTests(
      fakeAiWith({
        draftDescription: async (request) => {
          const reply = await fakeAi.draftDescription(request);
          return {
            ...reply,
            output: {
              ...reply.output!,
              description: `${reply.output!.description} It would suit a professional couple.`,
            },
          };
        },
      }),
    );
    expect(await draftDescription(member, lettingId)).toEqual({ ok: false, reason: 'unavailable' });
    expect((await drafted(member, lettingId))[0]?.data).toEqual({
      accepted: false,
      problem: 'wording',
    });
  });

  it('P5: no output from the model says the same', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    setAiProviderForTests(
      fakeAiWith({
        draftDescription: async () => ({
          output: null,
          refused: true,
          model: 'fake',
          usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        }),
      }),
    );
    expect(await draftDescription(member, lettingId)).toEqual({ ok: false, reason: 'unavailable' });
    expect((await drafted(member, lettingId))[0]?.data).toEqual({
      accepted: false,
      problem: 'unavailable',
    });
  });
});

describe('P4, P8: switched off or out of budget, it isn’t offered', () => {
  it('P8: AI_TASKS_OFF=description hides the action, and the model is never asked', async () => {
    vi.stubEnv('AI_TASKS_OFF', 'description');
    resetEnvForTests();
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    const { ai } = watchedAi();
    expect(await descriptionDraftingIsOffered()).toBe(false);
    expect(await draftDescription(member, lettingId)).toEqual({ ok: false, reason: 'unavailable' });
    expect(ai.draftDescription).not.toHaveBeenCalled();
  });

  it('P4: a spent budget hides the action, and the model is never asked', async () => {
    const now = new Date('2031-05-15T12:00:00Z');
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    const paid = { ...fakeAi, name: 'anthropic' as const };
    const { ai } = watchedAi(paid);
    expect(await descriptionDraftingIsOffered(now)).toBe(true);
    await db()
      .insert(aiCalls)
      .values({
        occurredAt: new Date('2031-05-02T09:00:00Z'),
        task: 'description',
        provider: 'anthropic',
        model: 'claude-opus-5-5',
        promptVersion: 'description@test',
        outcome: 'ok',
        costMicros: env().AI_MONTHLY_BUDGET_USD * 1_000_000,
      });
    forgetAiSpend();
    expect(await descriptionDraftingIsOffered(now)).toBe(false);
    expect(await draftDescription(member, lettingId, {}, now)).toEqual({
      ok: false,
      reason: 'unavailable',
    });
    expect(ai.draftDescription).not.toHaveBeenCalled();
  });
});

describe('P11: "Drafted by AI" until the lister changes the words', () => {
  it('P11: a draft saved as given is marked, and loses the mark when its words change', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    const draft = await draftDescription(member, lettingId);
    if (!draft.ok) throw new Error('no draft');
    expect((await markOf(member, lettingId)).description).toBeNull();

    const save = (text: string, mark?: string) =>
      saveAnswers(member, lettingId, {
        step: 'description',
        patch: { description: text },
        advance: false,
        draftedByAi: isGaffsDraft(lettingId, text, mark),
      });
    await save(draft.description, draft.mark);
    expect(await markOf(member, lettingId)).toEqual({
      description: draft.description,
      byAi: true,
    });
    expect((await loadHome(member, lettingId))?.answers.descriptionByAi).toBe(true);

    // Saved again unchanged, it is still the AI's words.
    await save(draft.description);
    expect((await markOf(member, lettingId)).byAi).toBe(true);
    // One word changed: the lister's now.
    await save(draft.description.replace('described', 'set out'), draft.mark);
    expect((await markOf(member, lettingId)).byAi).toBe(false);
  });

  it('P11: the mark is Gaff’s alone: it fits only the words and the home it was given for', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    const other = await aLiveLetting(member);
    const draft = await draftDescription(member, lettingId);
    if (!draft.ok) throw new Error('no draft');
    expect(isGaffsDraft(lettingId, draft.description, draft.mark)).toBe(true);
    expect(isGaffsDraft(lettingId, `${draft.description} Mine.`, draft.mark)).toBe(false);
    expect(isGaffsDraft(other.lettingId, draft.description, draft.mark)).toBe(false);
    expect(isGaffsDraft(lettingId, draft.description, '0'.repeat(64))).toBe(false);
    expect(isGaffsDraft(lettingId, draft.description, undefined)).toBe(false);
  });

  it('P11: a draft saved while the home is being added carries its mark into the letting', async () => {
    const member = await createTestMember();
    const { id } = await startDraft(member, { origin: 'manual' });
    await saveAnswers(member, id, { step: 'address', patch: address, advance: true });
    await saveAnswers(member, id, {
      step: 'rent',
      patch: { rentCents: 185_000, availableFrom: daysFromToday(30) },
      advance: true,
    });
    const draft = await draftDescription(member, id, { propertyType: 'house', bedrooms: '3' });
    if (!draft.ok) throw new Error('no draft');
    await saveAnswers(member, id, {
      step: 'home',
      patch: { propertyType: 'house', bedrooms: 3, description: draft.description },
      advance: true,
      draftedByAi: isGaffsDraft(id, draft.description, draft.mark),
    });
    expect(await markOf(member, id)).toEqual({ description: draft.description, byAi: true });
  });
});
