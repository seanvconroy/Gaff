import { formatDate } from '@/lib/format';
import type { CheckKind, CheckStatus } from './checks';

/**
 * R18, UX-DC-10 to UX-DC-13: a chosen applicant's checks, as the person deciding reads them.
 * Each check is a line in words with its tone. A check that didn't pass is in the warning style
 * with a plain reason, and is never a refusal: a person decides what happens next (rule 1).
 */
export interface CheckView {
  id: string;
  kind: CheckKind;
  status: CheckStatus;
  reason: string | null;
  refereeName: string | null;
  /** When the renter started it, or the referee was asked. */
  requestedAt: Date | null;
  /** When it was set up: the person was chosen. */
  createdAt?: Date | null;
  verifiedName?: string;
  /** BA-16 (P39): when the renter shared their work and income documents. */
  documentsSharedAt?: Date;
  /** BA-16 (P46): how many shared documents have something for a person to look at. */
  documentsToLookAt?: number;
  summary?: string;
}

export type CheckTone = 'success' | 'warning' | 'info' | 'neutral';

export interface CheckLine {
  label: string;
  text: string;
  tone: CheckTone;
  /** UX-DC-12: it didn't pass, or it is below the rule: the screen offers the two actions. */
  needsALook: boolean;
}

const order: readonly CheckKind[] = [
  'identity',
  'income',
  'landlord_reference',
  'employer_reference',
];

/** The checks in the order they're read: ID, income, then the references. */
export function inCheckOrder<T extends { kind: CheckKind }>(checks: readonly T[]): T[] {
  return [...checks].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

const labels: Record<CheckKind, string> = {
  identity: 'ID',
  income: 'Work and income',
  landlord_reference: 'Previous landlord',
  employer_reference: 'Employer',
};

const reasons: Record<string, string> = {
  document: 'the document couldn’t be confirmed',
  face_mismatch: 'the selfie didn’t match the ID',
  gave_up: 'it wasn’t finished',
};

/**
 * UX-DC-10: one check in words. BA-16 (P44): work and income are documents, read and checked,
 * never a figure against the rule here: no score, no ratio, no "pass". What each document shows
 * is on the renter's own page of checks (src/app/(task)/lettings/[lettingId]/checks/[applicationId]).
 */
export function checkLine(check: CheckView): CheckLine {
  const line = (tone: CheckTone, text: string): CheckLine => ({
    label: labels[check.kind],
    text,
    tone,
    needsALook: tone === 'warning',
  });
  const asked = check.requestedAt ? ` on ${formatDate(check.requestedAt)}` : '';
  switch (check.status) {
    case 'to_do':
      return line('neutral', 'Not started yet.');
    case 'in_progress':
      if (check.kind === 'income') return line('info', 'Adding their documents.');
      return check.kind.endsWith('reference')
        ? line('info', `Asked ${check.refereeName ?? 'them'}${asked}. No answer yet.`)
        : line('info', `Started${asked}.`);
    case 'passed':
      if (check.kind === 'identity') return line('success', `Verified: ${check.verifiedName}.`);
      return line('success', 'Done.');
    case 'not_passed':
      return line(
        'warning',
        `Not confirmed: ${reasons[check.reason ?? ''] ?? 'it wasn’t finished'}.`,
      );
    case 'answered':
      if (check.kind === 'income') {
        const on = check.documentsSharedAt ? ` on ${formatDate(check.documentsSharedAt)}` : '';
        const look = check.documentsToLookAt ?? 0;
        // P46: something to look at is in `warning`, with what to do; it's never a refusal.
        return look > 0
          ? line(
              'warning',
              `Documents shared${on}. ${look === 1 ? 'One thing' : `${look} things`} to look at.`,
            )
          : line('success', `Documents shared${on}.`);
      }
      return line(
        'success',
        `${check.refereeName ?? 'They'} answered. ${check.summary ?? ''}`.trim(),
      );
    case 'no_answer':
      // UX-RF-4: a referee who says they can't give the reference isn't one who didn't answer.
      return check.reason === 'cant_give'
        ? line('warning', `${check.refereeName ?? 'The referee'} can’t give a reference.`)
        : line('warning', `No answer from ${check.refereeName ?? 'them'} after two reminders.`);
    case 'not_needed':
      return line(
        'neutral',
        check.kind === 'landlord_reference'
          ? 'Not needed: they haven’t rented before.'
          : 'Not needed: no employer to ask.',
      );
  }
}

/** UX-DC-13: a check waiting longer than this on the renter or a referee offers a reminder. */
export const REMIND_AFTER_DAYS = 3;

export type WaitingOn = { who: 'renter' } | { who: 'referee'; name: string | null };

/**
 * UX-DC-13: who a check is waiting on, once it has waited more than three days: the renter, to
 * start or finish it, or the referee, to answer. Null for a check that's back, or not waited long.
 */
export function waitingTooLong(check: CheckView, now: Date): WaitingOn | null {
  const waiting = check.status === 'to_do' || check.status === 'in_progress';
  if (!waiting) return null;
  const since = check.status === 'to_do' ? check.createdAt : check.requestedAt;
  if (!since || now.getTime() - since.getTime() <= REMIND_AFTER_DAYS * 86_400_000) return null;
  return check.status === 'in_progress' && check.kind.endsWith('reference')
    ? { who: 'referee', name: check.refereeName }
    : { who: 'renter' };
}

/** UX-DC-11: every check for the person has ended, referees' answers included. */
export function allChecksBack(checks: ReadonlyArray<{ status: CheckStatus }>): boolean {
  return (
    checks.length > 0 &&
    checks.every((check) => check.status !== 'to_do' && check.status !== 'in_progress')
  );
}
