import type { ParsedEnquiry } from '@/domain/enquiries/parse';
import { type DraftAnswers, advertLinksIn, withAnswers } from './add-letting';
import {
  type DraftReading,
  emptyReading,
  MAX_QUOTE,
  stripPersonalDetails,
  tidy,
} from './advert-reading';
import { counties, normaliseEircode } from './new-letting';

/**
 * UX-LT-16: a home started from an enquiry Gaff couldn't match. What the portal's email says
 * about the home is its address and the advert's link, in labelled places, so this is a parser,
 * not the AI (section 7, "What is not AI"). The renter's own message is never read for facts
 * about the home, and nothing about the renter goes anywhere near the draft.
 *
 * Each value carries the words it came from, as a value read from an advert does (UX-AI-4).
 */
export function homeFromEnquiry(
  enquiry: Pick<ParsedEnquiry, 'addressHint'>,
  emailText: string,
): { answers: DraftAnswers; reading: DraftReading } {
  let answers: DraftAnswers = {};
  const reading = emptyReading('enquiry');
  const keep = (patch: Partial<DraftAnswers>, quote: string) => {
    answers = withAnswers(answers, patch);
    for (const key of Object.keys(patch) as Array<keyof DraftReading['sources']>) {
      reading.sources[key] = { quote: quote.slice(0, MAX_QUOTE), sure: true };
    }
  };

  // The address the portal gave: "12 Ranelagh Road, Ranelagh, Dublin 6". It is untrusted text
  // like any other, so anything that looks like contact details means it isn't used.
  const hint = tidy(enquiry.addressHint ?? '').replace(/\n/g, ' ');
  if (hint && hint.length <= 200 && stripPersonalDetails(hint) === hint) {
    const parts = hint
      .split(',')
      .map((part) => part.trim().replace(/\.$/, ''))
      .filter(Boolean);
    const eircode = parts.map(normaliseEircode).find(Boolean);
    const places = parts.filter((part) => !normaliseEircode(part));
    const [line1, ...rest] = places;
    if (line1 && line1.length >= 3 && line1.length <= 120) {
      keep({ addressLine1: line1 }, hint);
      const county = counties.find((each) =>
        new RegExp(`\\b${each}\\b`, 'i').test(rest.join(', ')),
      );
      const area = rest.filter((part) => !/^(co\.?|county)\s+\w+$/i.test(part)).join(', ');
      if (area.length >= 2 && area.length <= 80) keep({ area }, hint);
      if (county) keep({ county }, hint);
      if (eircode) keep({ eircode }, hint);
    }
  }

  // UX-LT-8: the advert's link, kept to match later enquiries to this home. Never fetched (Q31).
  const links = advertLinksIn(emailText);
  if (links.daftUrl) keep({ daftUrl: links.daftUrl }, links.daftUrl);
  if (links.myhomeUrl) keep({ myhomeUrl: links.myhomeUrl }, links.myhomeUrl);

  reading.found = Object.keys(reading.sources).length;
  return { answers, reading };
}
