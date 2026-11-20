import type { CheckKind, CheckStatus } from './checks';

/**
 * UX-RN-15: the three checks are done one at a time. The page shows the three as a short list
 * (done, next, to come) and only the next one's task and button. These rules say which is which.
 *
 * P39 (BA-16): the ID check, then the referees' names, then work and income documents, which end
 * with the one step that shares everything: the documents, and the referees, whom Gaff then
 * emails. So the referees come before the documents, and a named referee is the renter's part
 * done; the documents are done once shared (the income check is then `answered`).
 *
 * UX-RN-18 (rule 3): a renter with no previous landlord or no employer loses nothing by saying
 * so. "No" finishes the references as surely as two names do: neither is ever shown as missing.
 */
export type RenterCheck = 'identity' | 'income' | 'references';
/**
 * `arranged`: there's no service to start this check with here, so the operator arranges it
 * with the renter themselves. It is never the renter's task, and never holds up the next one.
 */
export type CheckListState = 'done' | 'next' | 'under_way' | 'to_come' | 'arranged';

export interface CheckFacts {
  kind: CheckKind;
  status: CheckStatus;
  /** P39: a referee the renter named, whom Gaff asks when they share their checks. */
  refereeName?: string | null;
}

export interface CheckListItem {
  check: RenterCheck;
  state: CheckListState;
}

const order: readonly RenterCheck[] = ['identity', 'references', 'income'];

function stateOf(check: RenterCheck, checks: readonly CheckFacts[]): 'done' | 'to_do' | 'started' {
  if (check === 'references') {
    const references = checks.filter(
      (c) => c.kind === 'landlord_reference' || c.kind === 'employer_reference',
    );
    // Named, answered, or "I don't have one": the renter's part is done either way.
    return references.every((c) => c.status !== 'to_do' || Boolean(c.refereeName))
      ? 'done'
      : 'to_do';
  }
  const status = checks.find((c) => c.kind === check)?.status;
  if (status === undefined || status === 'passed' || status === 'not_needed') return 'done';
  // BA-16: work and income documents are done once shared; adding them is the task itself.
  if (check === 'income') return status === 'answered' ? 'done' : 'to_do';
  return status === 'in_progress' ? 'started' : 'to_do';
}

/**
 * The check to do now. The first one not yet done comes first; a check the renter started but
 * didn't finish is offered again only once nothing else is waiting, because its result may
 * simply be on its way.
 */
export function nextCheck(
  checks: readonly CheckFacts[],
  /** Checks with no service to start them here: the operator arranges those. */
  unavailable: readonly RenterCheck[] = [],
): RenterCheck | null {
  const states = order
    .filter((check) => !unavailable.includes(check))
    .map((check) => [check, stateOf(check, checks)] as const);
  return (
    states.find(([, state]) => state === 'to_do')?.[0] ??
    states.find(([, state]) => state === 'started')?.[0] ??
    null
  );
}

export function checkList(
  checks: readonly CheckFacts[],
  unavailable: readonly RenterCheck[] = [],
): CheckListItem[] {
  const next = nextCheck(checks, unavailable);
  return order.map((check) => {
    const state = stateOf(check, checks);
    return {
      check,
      state:
        state === 'done'
          ? 'done'
          : unavailable.includes(check)
            ? 'arranged'
            : check === next
              ? 'next'
              : state === 'started'
                ? 'under_way'
                : 'to_come',
    };
  });
}

/**
 * Which referees to ask about, one per screen (UX-RN-15): the last landlord, then an employer.
 * An employer is only asked about when the renter said they earn from a job.
 */
export function refereesToAsk(checks: readonly CheckFacts[]): Array<'landlord' | 'employer'> {
  const open = (kind: CheckKind) =>
    checks.some((c) => c.kind === kind && c.status === 'to_do' && !c.refereeName);
  return [
    ...(open('landlord_reference') ? (['landlord'] as const) : []),
    ...(open('employer_reference') ? (['employer'] as const) : []),
  ];
}
