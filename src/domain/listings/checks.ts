import type { ProtectedGround } from '@/domain/compliance/protected-grounds';
import { hammingDistance } from '@/domain/lettings/photo-files';
import { caseDueBy } from '@/domain/trust/cases';

/**
 * BA-10 (the live line's M29, M45, M46, M48; P12 to P14): what Gaff checks about a home as it
 * goes public on gaff.ie, and whenever a public home's words or photos change.
 *
 * Two kinds of check, never mixed up:
 * - **At the field.** Something the lister can put right, told where they typed it, in their
 *   words: a description with contact details in it (M45), or wording on a protected ground
 *   (M46, `homeWordingProblem`). Nothing is held: the words can't be saved until they're right.
 *   The bar for being shown stays the redesign's: a BER and one photo (`onGaffNeeds`, Q51).
 * - **Risk signals (M29).** Signs that a listing may not be what it seems. They never refuse or
 *   decide anything: they hold the listing for a person on Gaff's team (a case of its own kind,
 *   `hold`), who releases it or keeps it off with reasons, and the lister can appeal once.
 *
 * Every signal is a code. Only codes, counts and IDs leave the checks: never another lister's
 * photos, words or rent.
 */

// ---------------------------------------------------------------------------------------------
// M45: no contact details in a home's description. Enquiries come through Gaff, so everyone
// hears back and nobody is taken off Gaff.

const CONTACT_PATTERNS: Array<[RegExp, string]> = [
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/i, 'an email address'],
  [/\b(https?:\/\/|www\.)\S+/i, 'a web link'],
  [/\b[a-z0-9-]+\.(ie|com|net|org|co\.uk)\b/i, 'a web address'],
  [/(\+?353|\b0)\s?\(?\d{1,2}\)?[\s-]?\d{3}[\s-]?\d{3,4}\b/, 'a phone number'],
  [/\b\d{3}[\s-]\d{3}[\s-]\d{4}\b/, 'a phone number'],
  [/\b(whats\s?app|telegram|signal|viber)\b/i, 'a messaging app'],
];

/** The first contact detail in the text, and what kind it is. Null: there are none. */
export function contactDetailsIn(text: string): { phrase: string; what: string } | null {
  for (const [pattern, what] of CONTACT_PATTERNS) {
    const found = pattern.exec(text);
    if (found) return { phrase: found[0], what };
  }
  return null;
}

/** M45: what's wrong, at the field, in a sentence the lister reads. Null: nothing. */
export function contactDetailsProblem(text: string): string | null {
  const found = contactDetailsIn(text);
  return found
    ? `Take out ${found.what}. Renters enquire through Gaff, so everyone hears back and nobody is pushed off Gaff.`
    : null;
}

// ---------------------------------------------------------------------------------------------
// M29: wording typical of rental scams. It holds the listing for a person; it is never told at
// the field, because a genuine lister rarely writes it and a scammer would only reword it.

const SCAM_PATTERNS: RegExp[] = [
  /\b(western union|moneygram|wire transfer|bank transfer before|pay (to|before) view(ing)?)\b/i,
  /\b(deposit|money|payment)\b[^.]{0,40}\bbefore (the )?view(ing)?\b/i,
  /\b(keys?|contract)\b[^.]{0,30}\b(by|in the) (post|courier)\b/i,
  /\b(i am|i'm|i’m|we are|we're|we’re) (abroad|overseas|out of the country|working abroad)\b/i,
  /\bairbnb\b[^.]{0,40}\b(hold|reserve|secure)\b/i,
];

export function hasScamWording(text: string): boolean {
  return SCAM_PATTERNS.some((pattern) => pattern.test(text));
}

// ---------------------------------------------------------------------------------------------
// M29: the risk signals.

export const riskSignals = [
  /** A photo matches one on a different lister's home (the photo pipeline's hash, ADR-0023). */
  'photo_reused',
  /** The rent is far below similar homes in the same place. */
  'rent_far_below',
  /** The description is word for word another lister's. */
  'description_copied',
  /** A new account put many homes on gaff.ie at once. */
  'new_account_burst',
  /** Wording typical of rental scams: money or keys before a viewing, an absent landlord. */
  'scam_wording',
  /** P12: the AI's wording check found wording that may exclude people on a protected ground. */
  'unfair_wording',
] as const;
export type RiskSignal = (typeof riskSignals)[number];

/** A rent below this share of the median for similar homes nearby is held for a look. */
export const FAR_BELOW = 0.6;
/** ...but only where there are enough similar homes to say what's usual. */
export const MIN_COMPARABLES = 5;
/** A description shorter than this is too ordinary to call copied. */
export const COPIED_MIN_CHARS = 200;
/** A burst: an account this new... */
export const NEW_ACCOUNT_DAYS = 7;
/** ...putting at least this many homes on gaff.ie (this one included)... */
export const BURST_HOMES = 6;
/** ...within this long. */
export const BURST_HOURS = 24;

/**
 * M29, ADR-0023: a photo with almost no detail (a plain wall, a blank square) hashes to nearly
 * all zeros or all ones, and would "match" every other plain photo. Only a photo with this many
 * of its 64 bits set, and as many clear, can be said to be another lister's.
 */
export const MIN_DETAIL_BITS = 8;

export function hasDetailToMatch(hash: bigint): boolean {
  const set = hammingDistance(hash, 0n);
  return set >= MIN_DETAIL_BITS && set <= 64 - MIN_DETAIL_BITS;
}

/** The description as compared for copying: case, spacing and punctuation don't count. */
export function comparableDescription(text: string | null): string | null {
  const plain = (text ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  return plain.length >= COPIED_MIN_CHARS ? plain : null;
}

/** What the checks found about one home: counts and numbers, read across listers as the system. */
export interface RiskFacts {
  /** This home's photos that match a photo on a different lister's home. */
  reusedPhotos: number;
  rentCents: number;
  /** Similar homes on gaff.ie now: same place, same number of bedrooms. */
  similar: { n: number; medianRentCents: number | null };
  /** Other listers' homes with the same description. */
  copiedDescriptions: number;
  /** Whether the account is new, and how many homes it put on gaff.ie lately, this one included. */
  account: { createdAt: Date; homesShownLately: number };
  description: string | null;
  /** P12: phrases the AI's wording check found. Null: it didn't run. */
  wordingFindings: number | null;
}

/** Which parts of a home a change touched, so the checks look again at only those. */
export const checkParts = ['all', 'photos', 'words', 'rent'] as const;
export type CheckPart = (typeof checkParts)[number];

const signalParts: Record<RiskSignal, readonly CheckPart[]> = {
  photo_reused: ['all', 'photos'],
  rent_far_below: ['all', 'rent'],
  description_copied: ['all', 'words'],
  scam_wording: ['all', 'words'],
  unfair_wording: ['all', 'words'],
  new_account_burst: ['all'],
};

/** Whether a check of these parts looks at this signal. */
export function looksAt(signal: RiskSignal, part: CheckPart): boolean {
  return signalParts[signal].includes(part);
}

/** M29: the signals these facts raise, in the fixed order. Empty: the home goes ahead. */
export function riskSignalsFrom(
  facts: RiskFacts,
  part: CheckPart = 'all',
  now: Date = new Date(),
): RiskSignal[] {
  const raised: Record<RiskSignal, boolean> = {
    photo_reused: facts.reusedPhotos > 0,
    rent_far_below:
      facts.similar.medianRentCents !== null &&
      facts.similar.n >= MIN_COMPARABLES &&
      facts.rentCents < facts.similar.medianRentCents * FAR_BELOW,
    description_copied: facts.copiedDescriptions > 0,
    new_account_burst:
      now.getTime() - facts.account.createdAt.getTime() < NEW_ACCOUNT_DAYS * 86_400_000 &&
      facts.account.homesShownLately >= BURST_HOMES,
    scam_wording: hasScamWording(facts.description ?? ''),
    unfair_wording: (facts.wordingFindings ?? 0) > 0,
  };
  return riskSignals.filter((signal) => raised[signal] && looksAt(signal, part));
}

/**
 * M29, M98: a signal a person on Gaff's team has already looked at and released, for this home,
 * holds it again only on new evidence: a new photo, new words, a new rent. Looking again at the
 * whole home (it was switched back on, say) skips what a person released.
 */
export function signalsToHold(
  raised: readonly RiskSignal[],
  part: CheckPart,
  released: readonly RiskSignal[],
): RiskSignal[] {
  return part === 'all' ? raised.filter((signal) => !released.includes(signal)) : [...raised];
}

/**
 * M97: when a person must decide a held listing by. A sign it may be a scam within 4 working
 * hours; wording that may be unfair alone, within 1 working day (as a report would be).
 */
export function holdDueBy(signals: readonly RiskSignal[], now: Date): Date {
  return caseDueBy(
    signals.some((signal) => signal !== 'unfair_wording') ? ['scam'] : ['unfair'],
    now,
  );
}

/** P13: a phrase the AI's wording check found, with the ground as a code. Nothing more is kept. */
export interface WordingFinding {
  phrase: string;
  ground: ProtectedGround;
}

/**
 * P13: the findings that count: each phrase copied word for word from the text, once. A finding
 * that isn't in the text is the model's invention, and is dropped.
 */
export function confirmedFindings<F extends { phrase: string }>(
  findings: readonly F[],
  text: string,
): F[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const phrase = finding.phrase.trim();
    if (phrase.length === 0 || phrase.length > 200 || !text.includes(phrase)) return false;
    if (seen.has(phrase.toLowerCase())) return false;
    seen.add(phrase.toLowerCase());
    return true;
  });
}
