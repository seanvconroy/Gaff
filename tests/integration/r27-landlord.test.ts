import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withOrg } from '@/db/client';
import { applications, events } from '@/db/schema';
import { landlordView } from '@/server/landlord/view';
import {
  landlordSharing,
  shareWithLandlord,
  stopSharingWithLandlord,
} from '@/server/landlord/share';
import { inviteToView } from '@/server/shortlist/invite';
import { aLiveLetting, aRenterEnquires, createTestMember, tokenInMessage } from './helpers';

const tokenOf = (url: string) => /\/l\/([A-Za-z0-9_-]{43})$/.exec(url)![1]!;

async function aSharedLetting() {
  const member = await createTestMember();
  const { lettingId } = await aLiveLetting(member);
  const first = await aRenterEnquires(member, 1, { occupants: '2', hasPets: 'no' });
  const second = await aRenterEnquires(member, 2, { occupants: '5', hasPets: 'no' });
  await inviteToView(member, lettingId, { chosenIds: [first], waitlistSize: 1 });
  const url = await shareWithLandlord(member, lettingId);
  return { member, lettingId, first, second, url };
}

describe('R27 and Q4: the landlord’s read-only link', () => {
  it('shows the stage, numbers, criteria, ranking and timeline, with renters as "Applicant N"', async () => {
    const { url } = await aSharedLetting();
    expect(url).toMatch(/^http:\/\/localhost:\d+\/l\/[A-Za-z0-9_-]{43}$/);
    const view = await landlordView(tokenOf(url));
    expect(view).toMatchObject({
      letting: { addressLine1: '12 Ranelagh Road', stage: 'viewings' },
      criteria: ['Up to 3 people', 'No pets (assistance dogs are always welcome)'],
      numbers: { enquiries: 2, answered: 2, invited: 1, waitlisted: 1 },
    });
    expect(view!.ranking.map((r) => [r.position, r.label, r.status])).toEqual([
      [1, 'Applicant 1', 'invited'],
      [2, 'Applicant 2', 'waitlisted'],
    ]);
    const whoAnswered = view!.timeline.filter((e) => e.what === 'A renter answered the questions');
    expect(whoAnswered.map((e) => e.who).sort()).toEqual(['Applicant 1', 'Applicant 2']);
  });

  it('never carries a renter’s name, email, phone or message', async () => {
    const { member, lettingId, url } = await aSharedLetting();
    const people = await withOrg(member.organisationId, (tx) =>
      tx.select().from(applications).where(eq(applications.lettingId, lettingId)),
    );
    const everything = JSON.stringify(await landlordView(tokenOf(url)));
    for (const person of people) {
      expect(everything).not.toContain(person.fullName);
      expect(everything).not.toContain(person.email);
      expect(everything).not.toContain(person.phone ?? 'no phone');
    }
    expect(everything).not.toContain('I would love to view it');
  });

  it('stops working the moment the operator stops sharing, and a renter’s link never opens it', async () => {
    const { member, lettingId, first, url } = await aSharedLetting();
    expect(await landlordSharing(member, lettingId)).toMatchObject({ shared: true });
    const renterToken = await tokenInMessage(member, first, 'invitation');
    expect(await landlordView(renterToken)).toBeNull();
    expect(await stopSharingWithLandlord(member, lettingId)).toBe(1);
    expect(await landlordView(tokenOf(url))).toBeNull();
    expect(await landlordSharing(member, lettingId)).toEqual({ shared: false, lastOpenedAt: null });
    const logged = await withOrg(member.organisationId, (tx) =>
      tx.select().from(events).where(eq(events.lettingId, lettingId)),
    );
    const sharing = logged.filter((e) => e.type.startsWith('letting.'));
    expect(sharing.map((e) => [e.type, Object.keys(e.data as object)])).toEqual(
      expect.arrayContaining([
        ['letting.shared_with_landlord', ['linkId']],
        ['letting.landlord_link_revoked', ['links']],
      ]),
    );
  });

  it('records when the landlord last looked', async () => {
    const { member, lettingId, url } = await aSharedLetting();
    await landlordView(tokenOf(url));
    const sharing = await landlordSharing(member, lettingId);
    expect(sharing.lastOpenedAt).toBeInstanceOf(Date);
  });
});
