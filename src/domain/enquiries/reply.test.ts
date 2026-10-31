import { describe, expect, it } from 'vitest';
import { stripQuotedReply } from './reply';

describe('R8: the new part of a renter’s reply', () => {
  it('drops the quoted conversation', () => {
    expect(
      stripQuotedReply(
        [
          'Thanks! Is the heating gas or electric?',
          '',
          'On Tue, 4 Nov 2026 at 09:12, Halcyon Lettings <x@mail.gaff.test> wrote:',
          '> Hello Aoife,',
          '> Thanks for your enquiry',
        ].join('\n'),
      ),
    ).toBe('Thanks! Is the heating gas or electric?');
  });

  it('handles Outlook-style replies', () => {
    expect(
      stripQuotedReply('Yes please.\n\n-----Original Message-----\nFrom: Halcyon Lettings'),
    ).toBe('Yes please.');
  });
});
