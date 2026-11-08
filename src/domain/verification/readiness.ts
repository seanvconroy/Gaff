import { formatShortDate } from '@/lib/format';

/**
 * M22, M26: what Gaff has checked about a letter, what's still missing before their homes can
 * go live, and the words on the badges renters see.
 */

export const checkMethods = ['mobile', 'id_document', 'psra_register'] as const;
export type CheckMethod = (typeof checkMethods)[number];
export const checkStatuses = ['pending', 'passed', 'failed', 'needs_review'] as const;
export type CheckStatus = (typeof checkStatuses)[number];

export interface CheckRecord {
  method: CheckMethod;
  status: CheckStatus;
  checkedAt?: Date | null;
  licenceNumber?: string | null;
  /** Why a check didn't pass, in a word the letter is shown in full. */
  reason?: string | null;
}

export type MissingCheck = 'mobile' | 'identity' | 'agency_licence' | 'agent_licence';

const passed = (checks: readonly CheckRecord[], method: CheckMethod) =>
  checks.some((c) => c.method === method && c.status === 'passed');

/**
 * M22: nothing goes live until the letter is checked.
 * - Everyone: their mobile and their identity, checked once as a person (P15, Q48).
 * - An agency: also its licence, and the agent's own licence (M23).
 */
export function missingChecks(letter: {
  kind: 'agency' | 'landlord';
  organisation: readonly CheckRecord[];
  member: readonly CheckRecord[];
}): MissingCheck[] {
  const missing: MissingCheck[] = [];
  if (!passed(letter.member, 'mobile')) missing.push('mobile');
  // P15 (Q48): every letter checks their identity once, agents as well as landlords.
  if (!passed(letter.member, 'id_document')) missing.push('identity');
  if (letter.kind === 'agency') {
    if (!passed(letter.organisation, 'psra_register')) missing.push('agency_licence');
    if (!passed(letter.member, 'psra_register')) missing.push('agent_licence');
  }
  return missing;
}

/** What the letter still has to do, in their words. */
export const missingCheckWords: Record<MissingCheck, string> = {
  mobile: 'Confirm your mobile number',
  identity: 'Check your identity: a photo of your ID, and a selfie if you agree',
  agency_licence: 'Gaff checks your agency’s PSRA licence on the public register',
  agent_licence: 'Gaff checks your own PSRA licence on the public register',
};

/** M26: badges say what was checked and when. Only passed checks get one. */
export function badgeWords(check: CheckRecord, now: Date = new Date()): string | null {
  if (check.status !== 'passed' || !check.checkedAt) return null;
  const on = formatShortDate(check.checkedAt, now);
  switch (check.method) {
    case 'id_document':
      return `Identity checked by Gaff on ${on}`;
    case 'psra_register':
      return check.licenceNumber
        ? `PSRA licence ${check.licenceNumber}, checked on the public register on ${on}`
        : null;
    case 'mobile':
      return null;
  }
}
