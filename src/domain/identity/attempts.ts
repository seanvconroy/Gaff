/**
 * P17 to P26 (the live line's ADR-0026, Q51 here): what the ID provider's own record of a check
 * allows. One provider session per check, reused for every try, as Stripe advises; three tries
 * at most; and 30 days after the result, the provider deletes the document and the selfie it
 * holds for Gaff. None of this is the verified identity a person keeps (`verified_identities`):
 * it is the provider's bookkeeping, and it holds codes, counts and dates only.
 */

/** P25: each try costs Gaff, so three at most. */
export const MAX_ATTEMPTS = 3;

/** P26: the provider deletes the images for Gaff this long after the result (rule 9). */
export const REDACT_AFTER_DAYS = 30;

/**
 * P18: each version of the words a person is shown before their ID check starts (the "what's
 * kept" line, `notices.check.identity` and `addLettingCopy.goLive.identity` in src/copy). A
 * change of wording adds a version; the last is the one shown now, and the one recorded when a
 * check starts.
 */
export const idCheckNoticeVersions = ['id_check_notice_v1'] as const;
export const ID_CHECK_NOTICE_VERSION = idCheckNoticeVersions[idCheckNoticeVersions.length - 1]!;

export interface AttemptRecord {
  /** Tries started with the provider so far. */
  attempts: number;
  passed: boolean;
}

/**
 * P25: may this person start another try? Never once it has passed; otherwise while tries are
 * left.
 *
 * SEAM (more tries, not built): Gaff's team giving a person more tries after three. `moreTries`
 * is always 0 until that is built; it will come from a record of the team's grant, and
 * `mayAttempt` is the one place that reads it.
 */
export function mayAttempt(record: AttemptRecord | null, moreTries = 0): boolean {
  if (!record) return true;
  if (record.passed) return false;
  return record.attempts < MAX_ATTEMPTS + moreTries;
}

/** P25: tries left, for the words on the page. */
export function attemptsLeft(record: AttemptRecord | null, moreTries = 0): number {
  if (!record) return MAX_ATTEMPTS + moreTries;
  return Math.max(0, MAX_ATTEMPTS + moreTries - record.attempts);
}

/** P26, rule 9: when the provider must have deleted what it holds for this check. */
export function redactAfter(from: Date): Date {
  return new Date(from.getTime() + REDACT_AFTER_DAYS * 86_400_000);
}
