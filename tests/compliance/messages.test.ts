import { describe, expect, it } from 'vitest';
import { lettingClosedEmail } from '@/copy/templates/closing';
import { firstReply } from '@/copy/templates/first-reply';
import { holdingEmail, invitationEmail, waitlistedEmail } from '@/copy/templates/invitations';
import { findProtectedGrounds } from '@/domain/compliance/protected-grounds';

const now = new Date('2026-10-31T12:00:00Z');
const input = {
  renterName: 'Aoife Byrne',
  operatorName: 'Halcyon Lettings',
  address: '12 Ranelagh Road',
  area: 'Ranelagh, Dublin 6',
  rentCents: 185_000,
  availableFrom: '2026-12-01',
  questionsUrl: 'https://app.gaff.test/r/abc',
  firstViewing: new Date('2026-11-07T18:00:00Z'),
  privacyUrl: 'https://app.gaff.test/privacy/halcyon-lettings',
};

describe('Compliance: the first reply (R7)', () => {
  const { subject, body } = firstReply(input, now);

  it('says the renter is dealing with an AI assistant (EU AI Act)', () => {
    expect(body).toContain('I’m Halcyon Lettings’ AI assistant');
  });

  it('says a person decides, and how to reach a person', () => {
    expect(body).toContain('a person at Halcyon Lettings makes every decision');
    expect(body).toContain('If you’d rather talk to a person, just reply and say so.');
  });

  it('says what happens next, and promises an answer either way', () => {
    expect(body).toContain('Viewings start on Saturday 7 November.');
    expect(body).toContain('Either way, you’ll hear back from us.');
  });

  it('links to the questions and the privacy notice (GDPR Article 14)', () => {
    expect(body).toContain('https://app.gaff.test/r/abc');
    expect(body).toContain(
      'How we use your details: https://app.gaff.test/privacy/halcyon-lettings',
    );
  });

  it('names the home by its address, with the rent and date in Irish format', () => {
    expect(subject).toBe('Your enquiry about 12 Ranelagh Road');
    expect(body).toContain(
      'The rent is €1,850 a month, and the home is available from Tuesday 1 December.',
    );
  });

  it('never asks for documents or payment, and touches no protected ground', () => {
    expect(body).not.toMatch(/payslip|bank statement|passport|PPS|deposit|fee|pay /i);
    expect(findProtectedGrounds(body)).toEqual([]);
  });

  it('uses no exclamation marks (design system voice)', () => {
    expect(body).not.toContain('!');
  });

  it('greets by first name, and falls back politely', () => {
    expect(body.startsWith('Hello Aoife,')).toBe(true);
    expect(firstReply({ ...input, renterName: 'x' }, now).body.startsWith('Hello there,')).toBe(
      true,
    );
  });

  it('asks nothing when the criteria need no answers', () => {
    expect(firstReply({ ...input, questionsUrl: null }, now).body).toContain(
      'You don’t need to do anything else for now.',
    );
  });
});

describe('Compliance: invitation, waiting list and holding messages (R11, Q6)', () => {
  const base = {
    renterName: 'Aoife Byrne',
    operatorName: 'Halcyon Lettings',
    address: '12 Ranelagh Road',
    area: 'Ranelagh, Dublin 6',
  };
  const sessions = [
    { startsAt: new Date('2026-11-07T18:00:00Z'), endsAt: new Date('2026-11-07T19:00:00Z') },
    { startsAt: new Date('2026-11-09T11:00:00Z'), endsAt: new Date('2026-11-09T11:30:00Z') },
  ];
  const emails = {
    invitation: invitationEmail({ ...base, bookingUrl: 'https://app.gaff.test/r/x', sessions }),
    waitlisted: waitlistedEmail(base),
    holding: holdingEmail({ ...base, viewingDays: sessions.map((s) => s.startsAt) }),
  };

  for (const [name, { body }] of Object.entries(emails)) {
    it(`${name}: says what happens next, kindly, with no protected ground or exclamation`, () => {
      expect(body).toMatch(/book|waiting list|hear from us/i);
      expect(findProtectedGrounds(body)).toEqual([]);
      expect(body).not.toContain('!');
      expect(body).not.toMatch(/unsuccessful|rejected|declined/i);
    });
  }

  it('the invitation lists the times and the booking link, with no account needed', () => {
    expect(emails.invitation.body).toContain('- Saturday 7 November, 6pm to 7pm');
    expect(emails.invitation.body).toContain(
      'You don’t need an account:\nhttps://app.gaff.test/r/x',
    );
  });

  it('the holding message says when viewings happen and promises an answer either way', () => {
    expect(emails.holding.body).toContain(
      'Viewings take place on Saturday 7 November and Monday 9 November.',
    );
    expect(emails.holding.body).toContain(
      'You’ll hear from us either way once a tenant has been chosen.',
    );
  });
});

describe('Compliance: the closing message (R26)', () => {
  const base = { ...input, deleteOn: '2026-12-05' };
  const sent = (['let', 'withdrawn'] as const).map((outcome) =>
    lettingClosedEmail({ ...base, outcome }),
  );

  it('tells everyone it’s closed, and when their details will be deleted', () => {
    expect(sent[0]!.subject).toBe('12 Ranelagh Road has been let');
    expect(sent[1]!.subject).toBe('12 Ranelagh Road is no longer available');
    for (const { body } of sent) {
      expect(body).toContain('We’ll delete your details from Gaff by Saturday 5 December.');
    }
  });

  it('blames no one, asks for nothing, and touches no protected ground', () => {
    for (const { body } of sent) {
      expect(body).not.toMatch(/unsuccessful|rejected|sorry|payslip|deposit|fee|pay /i);
      expect(body).not.toContain('!');
      expect(findProtectedGrounds(body)).toEqual([]);
    }
  });
});
