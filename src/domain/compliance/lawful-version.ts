/**
 * UX-MT-4 (rule 3, section 6, "What the founder's examples become"): when wording that says who
 * a home is for is left out, Gaff says what the lawful version is, where there is one. The
 * lawful version is always about the home or the terms of the let, never about the person:
 *
 * | What an operator might want to say | The closest lawful version in Gaff |
 * | --- | --- |
 * | "A working couple" | "Up to 2 people". The income rule, the same for everyone |
 * | "College students only" | A move-in date and a length of stay |
 * | "Professionals only", "references required" | Nothing: the income rule and the checks do it |
 * | "No HAP", "no rent allowance" | Nothing: HAP is accepted and counts as income |
 * | "A family home" | Facts about the home |
 * | "Mature tenants", "over 25s", "a quiet tenant" | Nothing |
 * | "Non-smokers" | The house rule "No smoking indoors" |
 * | "Long-term tenants" | "A year or longer" |
 *
 * It only ever offers; the operator chooses, in Letting details, and nothing here switches a
 * criterion on.
 */

const versions: Array<[RegExp, string]> = [
  [
    /\bcouples?\b(?! of\b)/i,
    'Did you mean “Up to 2 people”? Set it in Letting details. Gaff’s income rule is the same for everyone.',
  ],
  [
    /\b(?:students?|college|universit\w*)\b/i,
    'Did you mean a move-in date and a length of stay? Set them in Letting details. Students find a home by its dates.',
  ],
  [
    /\b(?:smok\w*|non[- ]?smok\w*)\b/i,
    'Did you mean “No smoking indoors”? It’s a house rule in Letting details.',
  ],
  [/\blong[- ]?term\b/i, 'Did you mean “A year or longer”? Set it in Letting details.'],
  [
    /\bfamil(?:y|ies)\b/i,
    'Did you mean what the home has? Describe its bedrooms, its garden and what’s nearby.',
  ],
  [
    /\b(?:hap|housing assistance|rent supplement|rent allowance|social welfare|welfare|dss)\b/i,
    'Gaff tells every renter that HAP is accepted, and counts it as income.',
  ],
  [
    /\b(?:professionals?|working|employed|references?|employment|payslips?|income|salary)\b/i,
    'Gaff’s income rule, the same for everyone, and the checks on the person you choose do that job.',
  ],
];

/** The lawful version of a line that was left out, in a sentence, or null where there is none. */
export function lawfulVersion(text: string): string | null {
  for (const [pattern, version] of versions) {
    if (pattern.test(text)) return version;
  }
  return null;
}
