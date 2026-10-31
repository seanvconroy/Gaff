/**
 * Screens text the operator writes for renters (key facts, answers) for wording that touches
 * the protected grounds of the Equal Status Acts (open question Q7; CLAUDE.md rule 3).
 * Gaff won't store or send such wording, and asks the operator to describe the home instead.
 *
 * It errs towards flagging: a false alarm costs the operator a rewrite, a miss could cost
 * them a discrimination complaint. The solicitor reviews this list before launch.
 */

export type ProtectedGround =
  | 'housing_assistance'
  | 'family_status'
  | 'civil_status'
  | 'gender'
  | 'age'
  | 'religion'
  | 'race'
  | 'traveller_community'
  | 'disability'
  | 'sexual_orientation';

export const groundLabels: Record<ProtectedGround, string> = {
  housing_assistance: 'housing assistance',
  family_status: 'family status',
  civil_status: 'civil status',
  gender: 'gender',
  age: 'age',
  religion: 'religion',
  race: 'race or nationality',
  traveller_community: 'the Traveller community',
  disability: 'disability',
  sexual_orientation: 'sexual orientation',
};

const patterns: Array<[ProtectedGround, RegExp]> = [
  // "Professionals only" adverts have been found to discriminate against HAP tenants.
  [
    'housing_assistance',
    /\b(hap|housing assistance|rent supplement|rental accommodation scheme|ras|social welfare|welfare|dss|on benefits)\b/i,
  ],
  [
    'housing_assistance',
    /\b(professionals|professional (person|people|tenants?|couples?|man|woman|only)|suits? (a )?professional)\b/i,
  ],
  [
    'family_status',
    /\b(child|children|kids?|famil(y|ies)|single parents?|lone parents?|pregnan\w*|babies|baby)\b/i,
  ],
  ['civil_status', /\b(married|unmarried|divorced|separated|widow(ed|er)?|civil partner\w*)\b/i],
  ['civil_status', /\b(couples? only|single (person|people|man|woman|men|women)( only)?)\b/i],
  ['gender', /\b(male|female|men|women|ladies|gentlemen|girls|boys)\b/i],
  [
    'age',
    /\b(mature|young|retired|retirees?|pensioners?|elderly|students?|age(d)?|over \d+|under \d+)\b/i,
  ],
  [
    'religion',
    /\b(christian|catholic|protestant|muslim|islam\w*|jewish|hindu|sikh|buddhist|religio\w*)\b/i,
  ],
  [
    'race',
    /\b(irish only|irish people only|nationality|nationals?|non-nationals?|foreign(ers?)?|ethnic\w*|race|racial|eu citizens?|visa)\b/i,
  ],
  ['traveller_community', /\btravell?ers?\b/i],
  ['disability', /\b(disab(led|ility|ilities)|handicapped|mental health)\b/i],
  ['sexual_orientation', /\b(gay|lesbian|straight|heterosexual|homosexual|lgbt\w*|queer)\b/i],
];

export interface ProtectedGroundMatch {
  ground: ProtectedGround;
  phrase: string;
}

export function findProtectedGrounds(text: string): ProtectedGroundMatch[] {
  const matches: ProtectedGroundMatch[] = [];
  for (const [ground, pattern] of patterns) {
    const found = pattern.exec(text);
    if (found && !matches.some((m) => m.ground === ground)) {
      matches.push({ ground, phrase: found[0] });
    }
  }
  return matches;
}

/** A plain explanation for the operator, or null if the text is fine. */
export function protectedGroundProblem(text: string): string | null {
  const [first] = findProtectedGrounds(text);
  if (!first) return null;
  return `“${first.phrase}” touches on ${groundLabels[first.ground]}, which equality law protects, so Gaff can't share it with renters. Describe the home instead, or leave it out.`;
}
