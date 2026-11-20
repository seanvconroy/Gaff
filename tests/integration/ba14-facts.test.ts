import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withOrg } from '@/db/client';
import { lettings } from '@/db/schema';
import { homeHighlights } from '@/domain/homes/home-page';
import { factsFor } from '@/server/answers/facts';
import { publicHomePage } from '@/server/homes/public-homes';
import { saveAnswers } from '@/server/lettings/drafts';
import { addPhoto } from '@/server/lettings/photos';
import { aPng } from '../fixtures/photos';
import { aLiveLetting, createTestMember } from './helpers';

describe('M39, M40, M44: more of a home’s facts, from set-up to its page and the AI’s answers', () => {
  it('M39: facts given at set-up are kept, shown on the page and answerable, each with an ID', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member, {
      ensuites: '1',
      floorAreaSqm: '72',
      floor: '2',
      lift: 'yes',
      heating: 'heat_pump',
      outdoorSpace: 'balcony',
      appliances: 'washing_machine,dishwasher',
      broadband: 'fibre',
      berNumber: '104123456',
      tourUrl: 'https://my.matterport.com/show/?m=abc123',
    });
    await addPhoto(member, lettingId, aPng([36, 99, 168]));
    const [letting] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(lettings).where(eq(lettings.id, lettingId)),
    );
    expect(letting!.moreFacts).toEqual({
      ensuites: 1,
      floorAreaSqm: 72,
      floor: 2,
      lift: true,
      heating: 'heat_pump',
      outdoorSpace: 'balcony',
      appliances: ['washing_machine', 'dishwasher'],
      broadband: 'fibre',
      berNumber: '104123456',
      tourUrl: 'https://my.matterport.com/show/?m=abc123',
    });

    const page = await publicHomePage(letting!.publicRef);
    if (page?.state !== 'live') throw new Error('expected a live page');
    expect(homeHighlights(page.home.home).map((h) => h.text)).toEqual(
      expect.arrayContaining([
        '1 en-suite',
        '72 m²',
        '2nd floor, with a lift',
        'Heat pump',
        'Balcony',
        'Washing machine and dishwasher',
        'Fibre broadband',
      ]),
    );
    expect(page.home.home.more?.tourUrl).toBe('https://my.matterport.com/show/?m=abc123');

    const facts = await withOrg(member.organisationId, (tx) => factsFor(tx, letting!));
    const byId = Object.fromEntries(facts.map((fact) => [fact.id, fact.text]));
    expect(byId).toMatchObject({
      'core:en-suites': 'En-suites: 1',
      'core:floor-area': 'Floor area: 72 m²',
      'core:floor': 'Floor: 2nd floor',
      'core:lift': 'Lift: Yes',
      'core:heating': 'Heating: Heat pump',
      'core:outdoor-space': 'Outdoor space: Balcony',
      'core:appliances': 'Appliances: Washing machine and dishwasher',
      'core:broadband': 'Broadband: Fibre broadband',
      'core:ber-number': 'BER number: 104123456',
      'core:tour': 'Video or virtual tour: https://my.matterport.com/show/?m=abc123',
    });
  });

  it('M39: changing the home from Home keeps what’s given and drops what’s taken out', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member, { floor: '3', heating: 'gas' });
    await saveAnswers(member, lettingId, {
      step: 'home',
      patch: { floor: undefined, outdoorSpace: 'garden', ensuites: 2 },
      advance: false,
    });
    const [letting] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(lettings).where(eq(lettings.id, lettingId)),
    );
    expect(letting!.moreFacts).toEqual({ heating: 'gas', outdoorSpace: 'garden', ensuites: 2 });
  });
});
