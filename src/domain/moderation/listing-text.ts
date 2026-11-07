import { findProtectedGrounds, groundLabels } from '@/domain/compliance/protected-grounds';

/**
 * M45, M46, M29: checks on the words of a listing. Protected-ground wording and contact details
 * block publishing; wording typical of rental scams holds the listing for a person at Gaff.
 */

/** Ordinary property words that would otherwise trip the protected-ground check. */
const INNOCENT = [/\bfamily bathroom\b/gi, /\bfamily room\b/gi, /\bfamily-sized\b/gi];

export interface TextFinding {
  kind: 'protected_ground' | 'contact_details' | 'scam_wording';
  phrase: string;
  /** Words for the letter: what's wrong and what to do. */
  message: string;
}

const CONTACT_PATTERNS: Array<[RegExp, string]> = [
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/i, 'an email address'],
  [/\b(https?:\/\/|www\.)\S+/i, 'a web link'],
  [/\b[a-z0-9-]+\.(ie|com|net|org|co\.uk)\b/i, 'a web address'],
  [/(\+?353|\b0)\s?\(?\d{1,2}\)?[\s-]?\d{3}[\s-]?\d{3,4}\b/, 'a phone number'],
  [/\b\d{3}[\s-]\d{3}[\s-]\d{4}\b/, 'a phone number'],
  [/\b(whats\s?app|telegram|signal|viber)\b/i, 'a messaging app'],
];

const SCAM_PATTERNS: RegExp[] = [
  /\b(western union|moneygram|wire transfer|bank transfer before|pay (to|before) view(ing)?)\b/i,
  /\b(deposit|money|payment)\b[^.]{0,40}\bbefore (the )?view(ing)?\b/i,
  /\b(keys?|contract)\b[^.]{0,30}\b(by|in the) (post|courier)\b/i,
  /\b(i am|i'm|we are|we're) (abroad|overseas|out of the country|working abroad)\b/i,
  /\bairbnb\b[^.]{0,40}\b(hold|reserve|secure)\b/i,
];

export function checkListingText(text: string): TextFinding[] {
  const findings: TextFinding[] = [];
  let screened = text;
  for (const innocent of INNOCENT) screened = screened.replace(innocent, ' ');
  for (const match of findProtectedGrounds(screened)) {
    findings.push({
      kind: 'protected_ground',
      phrase: match.phrase,
      message: `“${match.phrase}” touches on ${groundLabels[match.ground]}, which equality law protects. Describe the home instead: every listing on Gaff is open to everyone who meets your criteria.`,
    });
  }
  for (const [pattern, what] of CONTACT_PATTERNS) {
    const found = pattern.exec(text);
    if (found && !findings.some((f) => f.kind === 'contact_details')) {
      findings.push({
        kind: 'contact_details',
        phrase: found[0],
        message: `Take out ${what}. Renters enquire through Gaff, so everyone hears back and nobody is pushed off Gaff.`,
      });
    }
  }
  for (const pattern of SCAM_PATTERNS) {
    const found = pattern.exec(text);
    if (found) {
      findings.push({
        kind: 'scam_wording',
        phrase: found[0],
        message: 'Gaff checks listings that ask for money or contact before a viewing.',
      });
      break;
    }
  }
  return findings;
}

/** Findings that stop a listing being published until the letter changes the words. */
export function blockingFindings(findings: readonly TextFinding[]): TextFinding[] {
  return findings.filter((f) => f.kind !== 'scam_wording');
}
