import { describe, expect, it } from 'vitest';
import { findProtectedGrounds } from '@/domain/compliance/protected-grounds';
import { ownerLinkEmail } from './owner';

/**
 * UX-OW-1 (R27): the email that gives an owner their private link. New wording in WP-13, for the
 * solicitor with the other fixed templates; until it's agreed, these words are pinned here.
 */
describe('UX-OW-1: the owner’s link email', () => {
  const email = ownerLinkEmail({
    ownerName: 'Tom Walsh',
    operatorName: 'Halcyon Lettings',
    address: '12 Ranelagh Road',
    area: 'Ranelagh, Dublin 6',
    followUrl: 'https://gaff.example/l/abc',
  });

  it('UX-OW-1: names the home in the subject, and its words are exactly these', () => {
    expect(`Subject: ${email.subject}\n\n${email.body}`).toBe(
      [
        'Subject: 12 Ranelagh Road: follow the letting',
        '',
        'Hello Tom,',
        '',
        'Halcyon Lettings is letting 12 Ranelagh Road, Ranelagh, Dublin 6, for you. You can see how it’s going at any time, here. There’s nothing to sign up for:',
        'https://gaff.example/l/abc',
        '',
        'The page shows where the letting stands and what has been decided. When Halcyon Lettings has chosen a tenant, you’ll get an email asking you to approve.',
        '',
        'Halcyon Lettings',
      ].join('\n'),
    );
  });

  it('UX-PP-9: never invites the owner to use Gaff, and touches no protected ground', () => {
    const words = email.body.replace('https://gaff.example/l/abc', '');
    expect(words).not.toMatch(/Gaff|create an account|\btry\b/i);
    expect(findProtectedGrounds(email.body)).toEqual([]);
  });

  it('UX-OW-1: greets an owner by first name only when it looks like one', () => {
    expect(
      ownerLinkEmail({
        ownerName: 'X',
        operatorName: 'Halcyon Lettings',
        address: '12 Ranelagh Road',
        area: 'Ranelagh',
        followUrl: 'https://gaff.example/l/abc',
      }).body.split('\n')[0],
    ).toBe('Hello,');
  });
});
