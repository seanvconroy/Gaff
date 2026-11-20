import { describe, expect, it } from 'vitest';
import { ENQUIRIES_CLOSED_TEMPLATE, enquiriesClosedReply } from './enquiries-closed';

/**
 * UX-LP-5 (BA-14): the fixed reply to an enquiry that came after enquiries closed. A new fixed
 * message for the solicitor's list: if this fails, its words changed, which is the solicitor's
 * decision and never a side effect. Pinned here, beside the others in
 * tests/compliance/template-words.test.ts, which stay as they were.
 */
describe('UX-LP-5: the "no longer taking enquiries" reply', () => {
  it('UX-LP-5: its subject and words are exactly these', () => {
    expect(ENQUIRIES_CLOSED_TEMPLATE).toBe('enquiries_closed@1');
    const { subject, body } = enquiriesClosedReply({
      renterName: 'Aoife Byrne',
      operatorName: 'Liffey Lettings',
      address: '12 Ranelagh Road',
      area: 'Ranelagh, Dublin 6',
      searchUrl: 'https://gaff.ie/',
    });
    expect(subject).toBe('12 Ranelagh Road is no longer taking enquiries');
    expect(body).toBe(
      [
        'Hello Aoife,',
        '',
        'Thank you for your enquiry about 12 Ranelagh Road, Ranelagh, Dublin 6. Liffey Lettings has stopped taking new enquiries for this home, so your enquiry hasn’t been added to it.',
        '',
        'You can see other homes to rent at https://gaff.ie/',
        '',
        'This is an automatic reply from Gaff’s AI assistant. To reach a person at Liffey Lettings, reply to this email.',
        '',
        'You don’t need to do anything else.',
        '',
        'Liffey Lettings',
      ].join('\n'),
    );
  });

  it('rule 6, voice: it says it is from an AI assistant, how to reach a person, and has no exclamation', () => {
    const { body } = enquiriesClosedReply({
      renterName: '',
      operatorName: 'Mary',
      address: '4 Main Street',
      area: 'Kinsale',
      searchUrl: 'https://gaff.ie/',
    });
    expect(body.startsWith('Hello,')).toBe(true);
    expect(body).toContain('AI assistant');
    expect(body).toContain('To reach a person');
    expect(body).not.toContain('!');
  });
});
