/**
 * R17 (stage 5): the operator compares applicants side by side and chooses a preferred
 * applicant and, if they like, a backup. Gaff orders and explains; it never chooses
 * (Principle 1, GDPR Article 22). Checks then run for those two people only (R18).
 */
export type Choice =
  { ok: true; preferredId: string; backupId: string | null } | { ok: false; error: string };

export function validateChoice(input: {
  applied: ReadonlySet<string>;
  preferredId: string;
  backupId: string;
}): Choice {
  if (!input.preferredId) return { ok: false, error: 'Choose your preferred applicant.' };
  if (!input.applied.has(input.preferredId)) {
    return { ok: false, error: 'Choose your preferred applicant from the people who applied.' };
  }
  if (!input.backupId) return { ok: true, preferredId: input.preferredId, backupId: null };
  if (input.backupId === input.preferredId) {
    return {
      ok: false,
      error: 'Your backup needs to be someone other than your preferred applicant.',
    };
  }
  if (!input.applied.has(input.backupId)) {
    return { ok: false, error: 'Choose your backup from the people who applied.' };
  }
  return { ok: true, preferredId: input.preferredId, backupId: input.backupId };
}

/** Statuses that mean someone applied and is still in the running. */
export const CHOOSABLE = ['applied', 'preferred', 'backup'] as const;
