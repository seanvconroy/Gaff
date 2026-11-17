import { describe, expect, it } from 'vitest';
import { parseEnquiry } from '@/domain/enquiries/parse';
import { missingCore } from './add-letting';
import { reviewChecks } from './advert-reading';
import { homeFromEnquiry } from './from-enquiry';

/** A made-up enquiry email, modelled on the portals' format. Nobody real. */
const email = {
  from: 'Daft.ie <noreply@daft.ie>',
  replyTo: 'Aoife Byrne <aoife.byrne@example.ie>',
  subject: 'New enquiry about 40 Harbour Road',
  text: [
    'You have a new enquiry.',
    'Property: 40 Harbour Road, Kinsale, Co. Cork, P17 X2Y3',
    'Name: Aoife Byrne',
    'Email: aoife.byrne@example.ie',
    'Phone: 087 123 4567',
    'Message: Hi, is the house still available? I am a nurse with two children and I get HAP.',
    'View listing: https://www.daft.ie/for-rent/house-40-harbour-road-kinsale/5559876',
  ].join('\n'),
};

function fromEmail(given = email) {
  const parsed = parseEnquiry(given);
  if (!parsed.ok) throw new Error('the made-up email is not an enquiry');
  return homeFromEnquiry(parsed.enquiry, given.text);
}

describe('UX-LT-16: a home started from an enquiry', () => {
  it('fills in the address and the advert link, each with the words it came from', () => {
    const { answers, reading } = fromEmail();
    expect(answers).toEqual({
      addressLine1: '40 Harbour Road',
      area: 'Kinsale',
      county: 'Cork',
      eircode: 'P17 X2Y3',
      daftUrl: 'https://www.daft.ie/for-rent/house-40-harbour-road-kinsale/5559876',
    });
    expect(reading.from).toBe('enquiry');
    expect(reading.sources.addressLine1).toEqual({
      quote: '40 Harbour Road, Kinsale, Co. Cork, P17 X2Y3',
      sure: true,
    });
    expect(reading.sources.daftUrl?.quote).toBe(answers.daftUrl);
    expect(reading.found).toBe(5);
  });

  it('takes nothing from the renter’s message, and nothing about the renter (rule 2, rule 3)', () => {
    const { answers, reading } = fromEmail();
    const kept = JSON.stringify({ answers, reading });
    expect(kept).not.toMatch(/Aoife|Byrne|example\.ie|087|nurse|children|HAP/i);
    expect(answers.description).toBeUndefined();
    expect(answers.otherFacts).toBeUndefined();
    expect(answers.criteria).toBeUndefined();
    expect(reading.leftOut).toEqual([]);
  });

  it('never guesses the rest: the rent, the date and the home are for the person', () => {
    const { answers, reading } = fromEmail();
    expect(missingCore(answers)).toEqual(['rent', 'home']);
    expect(reviewChecks({ answers, photos: 0 }, '2026-11-17', reading)).toEqual([
      'rent',
      'available_from',
      'home',
      'ber',
      'photos',
    ]);
  });

  it('uses the subject where the email has no property line, and no area it wasn’t given', () => {
    const { answers } = fromEmail({
      ...email,
      text: email.text
        .split('\n')
        .filter((line) => !line.startsWith('Property') && !line.startsWith('View'))
        .join('\n'),
    });
    expect(answers).toEqual({ addressLine1: '40 Harbour Road' });
  });

  it('uses no address that carries contact details', () => {
    const { answers } = fromEmail({
      ...email,
      text: email.text.replace(
        'Property: 40 Harbour Road, Kinsale, Co. Cork, P17 X2Y3',
        'Property: call 087 123 4567 about 40 Harbour Road',
      ),
    });
    expect(answers.addressLine1).toBeUndefined();
    expect(answers.daftUrl).toBeDefined();
  });

  it('starts with nothing at all where the email says nothing about the home', () => {
    const { answers, reading } = homeFromEnquiry({ addressHint: null }, 'Message: Is it free?');
    expect(answers).toEqual({});
    expect(reading.found).toBe(0);
  });
});
