import { lawfulVersion } from './lawful-version';
import { findProtectedGrounds, groundLabels, type ProtectedGround } from './protected-grounds';

/**
 * UX-LT-6, UX-MT-4 (rule 3): wording that says who a home is for, without naming a protected
 * ground. "Would suit", "references required", "quiet tenants preferred": the Equal Status Acts
 * forbid an advert that "might reasonably be understood" to prefer a kind of person, and these
 * are the phrases adverts use to do it (section 6 of the UX redesign). A home's description and
 * its facts describe the home, so Gaff leaves such a line out of an imported advert, and won't
 * take it in a description.
 *
 * This is for words about a HOME. A reply to a renter can properly say "references are asked
 * for at the application stage", so messages and answers keep to the protected-ground check.
 *
 * Like that check, it errs towards flagging. The solicitor reviews this list before launch.
 */

const PEOPLE =
  'tenants?|couples?|professionals?|persons?|people|sharers?|students?|famil(?:y|ies)|workers?|individuals?|someone|commuters?|singles?|applicants?|occupants?|lady|ladies|gentlem[ae]n|retirees?';

const patterns: RegExp[] = [
  // "Would suit…", "to suit…", "suits…": the words the law objects to in adverts.
  /\b(?:would|will|may|might|could|should|to) (?:best |ideally |also )?suit\b/i,
  /\bsuits\b/i,
  new RegExp(`\\bsuit(?:able|ed) (?:for|to) (?:an? |the )?(?:[a-z-]+ ){0,2}(?:${PEOPLE})\\b`, 'i'),
  new RegExp(
    `\\b(?:ideal|perfect|great|best)(?:ly)? (?:for|suited to) (?:an? |the )?(?:[a-z-]+ ){0,2}(?:${PEOPLE})\\b`,
    'i',
  ),
  // "Quiet tenants preferred", "working couple", "respectable people only".
  new RegExp(
    `\\b(?:working|employed|quiet|respectable|clean|tidy|responsible|reliable|mature|professional) (?:${PEOPLE})\\b`,
    'i',
  ),
  /\b(?:tenants?|applicants?|occupants?|sharers?|couples?)\b[^.!?\n]*\b(?:preferred|only|wanted|sought|considered)\b/i,
  // "References required", "must be working", "proof of income essential".
  /\b(?:references?|employment|employer|payslips?|proof of (?:income|employment)|income|salary|work)\b[^.!?\n]*\b(?:required|needed|essential|necessary|a must)\b/i,
  /\bmust (?:be|have) (?:working|employed|in (?:full[- ]time )?employment|references?|a job)\b/i,
  /\bnon[- ]?smok(?:ers?|ing (?:tenants?|persons?|people|household))\b/i,
  /\bno (?:sharers|smokers|couples|singles|dss)\b/i,
  // A couple is two people who are a couple: "up to 2 people" is the lawful way to say it.
  /\bcouples?\b(?! of\b)/i,
];

/** The words in the text that say who should apply, or null. */
export function whoShouldApplyPhrase(text: string): string | null {
  for (const pattern of patterns) {
    const found = pattern.exec(text);
    if (found) return found[0];
  }
  return null;
}

/** Why words about a home can't be shared: the ground they touch, or that they are about who applies. */
export type HomeWordingReason = ProtectedGround | 'about_who';

/** The first thing wrong with words about a home (rule 3), or null: they describe the home. */
export function homeWordingReason(
  text: string,
): { reason: HomeWordingReason; phrase: string } | null {
  const [ground] = findProtectedGrounds(text);
  if (ground) return { reason: ground.ground, phrase: ground.phrase };
  const phrase = whoShouldApplyPhrase(text);
  return phrase ? { reason: 'about_who', phrase } : null;
}

/** Why a line was left out, or can't be kept, in a sentence a lister reads. */
export function homeWordingWhy(reason: HomeWordingReason): string {
  return reason === 'about_who'
    ? 'It says who should live there, not what the home is like.'
    : `It touches on ${groundLabels[reason]}, which equality law protects.`;
}

/**
 * UX-MT-4: why a line was left out, and its lawful version where there is one ("Did you mean “Up
 * to 2 people”?"), as the review of an imported advert says it.
 */
export function leftOutWhy(line: string, reason: HomeWordingReason): string {
  const instead = lawfulVersion(line);
  return instead ? `${homeWordingWhy(reason)} ${instead}` : homeWordingWhy(reason);
}

/**
 * A plain explanation at the field (UX-FL-3), or null if the words are fine. For a home's
 * description and its facts: what renters read about the home. Where there is a lawful version
 * of what was meant, it is offered (UX-MT-4).
 */
export function homeWordingProblem(text: string): string | null {
  const found = homeWordingReason(text);
  if (!found) return null;
  const problem =
    found.reason === 'about_who'
      ? `“${found.phrase}” says who should live there, not what the home is like, so Gaff can't share it with renters.`
      : `“${found.phrase}” touches on ${groundLabels[found.reason]}, which equality law protects, so Gaff can't share it with renters.`;
  const instead = lawfulVersion(found.phrase) ?? lawfulVersion(text);
  return `${problem} ${instead ?? 'Describe the home instead, or leave it out.'}`;
}
