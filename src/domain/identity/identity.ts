import { z } from 'zod';

/**
 * A verified identity (Q35, CLAUDE.md rule 2, UX-PF-8 to UX-PF-14). A person does the ID check
 * once; if they choose, the result is kept on their own profile and reused in every role.
 *
 * UX-PF-10: what is kept is exactly three things: that the check passed, the verified name, and
 * the date. A row existing is the first; the other two are its columns. No image, no document
 * number, no document type, no issuing country and no date of birth, anywhere: the identity port
 * (src/ports/checks.ts) returns only whether the check passed, the name, and a reason code when
 * it didn't, so there is nothing more to drop.
 *
 * UX-PF-9: it has no expiry. It lasts as long as the profile and goes with it.
 */
export interface KeptIdentity {
  verifiedName: string;
  /** When the check passed. */
  verifiedAt: Date;
}

/**
 * The columns of `verified_identities`, and the only ones it may have (a compliance test holds
 * it): whose it is, the name, the date.
 */
export const keptIdentityColumns = ['user_id', 'verified_name', 'verified_at'] as const;

/** The name as an ID provider gives it: one line, of a sensible length. */
export const verifiedNameSchema = z.string().trim().min(1).max(120);

/**
 * A name as it can be compared: accents, case, apostrophes, hyphens and spacing don't count, and
 * nor does the order of the parts. "Seán Ó Briain" and "sean o'briain" are the same name;
 * "Aoife Byrne" and "Aoife Ní Bhriain" aren't.
 */
function comparable(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .sort()
    .join(' ');
}

/** UX-PF-14: whether a verified name and the name on an application are the same name. */
export function namesMatch(a: string, b: string): boolean {
  const left = comparable(a);
  return left.length > 0 && left === comparable(b);
}

/**
 * UX-PF-12, UX-PF-14: the renter's ID check, at the checks stage, for someone an operator has
 * chosen.
 * - `use_kept`: they have one kept: "Use the ID check you did on 3 October?" Nothing reaches the
 *   operator until they say yes, this time.
 * - `check_name`: they have one kept, but its name isn't the name on this application. They're
 *   asked to check their name or do the check again.
 * - `provider`: the check itself, with the provider: nothing kept, or they said no.
 */
export type IdentityStep =
  | { step: 'use_kept'; kept: KeptIdentity }
  | { step: 'check_name'; kept: KeptIdentity; applicationName: string }
  | { step: 'provider' };

export function identityStep(input: {
  kept: KeptIdentity | null;
  applicationName: string;
  /** They said no to the kept one, for this check. */
  doAgain: boolean;
}): IdentityStep {
  if (!input.kept || input.doAgain) return { step: 'provider' };
  if (!namesMatch(input.kept.verifiedName, input.applicationName)) {
    return { step: 'check_name', kept: input.kept, applicationName: input.applicationName };
  }
  return { step: 'use_kept', kept: input.kept };
}

/**
 * UX-PF-8: after a check passes, one screen asks "Keep this, so you never have to do it again?"
 * It isn't asked when what passed is already the one kept: a kept check that was used again, or
 * one kept a moment ago.
 */
export function offerToKeep(input: {
  passed: KeptIdentity | null;
  kept: KeptIdentity | null;
}): boolean {
  if (!input.passed) return false;
  if (!input.kept) return true;
  return !(
    input.kept.verifiedAt.getTime() === input.passed.verifiedAt.getTime() &&
    input.kept.verifiedName === input.passed.verifiedName
  );
}

/**
 * What the operator's copy of an ID check holds, sealed (ADR-0005): the name and the date it
 * passed. The same two things whether the renter did the check for this home or said yes to
 * the one they keep. Older results hold the name alone; their date is when the check ended.
 */
export interface IdentityCheckResult {
  verifiedName: string;
  /** ISO date and time. */
  verifiedAt?: string;
}

export function identityFromResult(
  result: Record<string, unknown> | null,
  completedAt: Date | null,
): KeptIdentity | null {
  if (!result || typeof result.verifiedName !== 'string') return null;
  const at = typeof result.verifiedAt === 'string' ? new Date(result.verifiedAt) : completedAt;
  if (!at || Number.isNaN(at.getTime())) return null;
  return { verifiedName: result.verifiedName, verifiedAt: at };
}

/**
 * Why a person's own ID check runs, when no letting's checks ask for it:
 * - `go_live`: a private landlord's first go-live (Q47, UX-TS-2);
 * - `name_changed`: "My name has changed", from Profile (UX-PF-9), for someone who keeps one.
 * Never anything else: a renter is never invited to verify before an operator has chosen them
 * (UX-PF-13, OQ-5).
 */
export const personCheckPurposes = ['go_live', 'name_changed'] as const;
export type PersonCheckPurpose = (typeof personCheckPurposes)[number];

/** Whether a person may start their own ID check for this purpose (UX-PF-13). */
export function mayStartPersonCheck(input: {
  purpose: PersonCheckPurpose;
  /** They let their own homes, as a private landlord. */
  privateLandlord: boolean;
  kept: boolean;
}): boolean {
  return input.purpose === 'go_live' ? input.privateLandlord : input.kept;
}
