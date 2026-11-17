/**
 * The rules of questions asked one per screen (`QuestionSteps`), tested without a browser: which
 * screens are on the path for the answers so far, which comes next, and which one a page opens
 * on. They read what was answered only to decide which screen follows, never to judge it.
 */
type Values = Readonly<Record<string, string>>;

export interface StepRule {
  /** What the page's address holds: `?q=people`. Never an answer. */
  id: string;
  /** The fields this screen holds: an error on one of them opens this screen. */
  fields: readonly string[];
  /** What's wrong on this screen, by field. Empty when it can move on. */
  check?: (values: Values) => Record<string, string>;
  /** Left off the path while this is true: a landlord's details after "No, I haven't rented". */
  skip?: (values: Values) => boolean;
  /** Off the path: opened from a "Change" on the last screen, and "Done" returns there. */
  aside?: boolean;
}

/** The screens someone goes through, in order, for the answers so far. */
export function pathOf<T extends StepRule>(steps: readonly T[], values: Values): T[] {
  return steps.filter((step) => !step.aside && !step.skip?.(values));
}

export function stepAfter(steps: readonly StepRule[], values: Values, id: string): string | null {
  const path = pathOf(steps, values);
  const at = path.findIndex((step) => step.id === id);
  return path[at + 1]?.id ?? null;
}

export function stepBefore(steps: readonly StepRule[], values: Values, id: string): string | null {
  const path = pathOf(steps, values);
  const at = path.findIndex((step) => step.id === id);
  return at > 0 ? path[at - 1]!.id : null;
}

/**
 * The screen a page opens on. The one its address asks for, if every screen before it has been
 * answered; otherwise the first that hasn't. So a link to a later screen never skips a question,
 * and someone who comes back lands where they were.
 */
export function firstOpenStep(
  steps: readonly StepRule[],
  values: Values,
  asked?: string | null,
): string {
  const path = pathOf(steps, values);
  const aside = steps.find((step) => step.aside && step.id === asked);
  const answered = (step: StepRule) => Object.keys(step.check?.(values) ?? {}).length === 0;
  for (const step of path) {
    if (step.id === asked && !aside) return step.id;
    if (!answered(step)) return step.id;
  }
  if (aside) return aside.id;
  return path[path.length - 1]?.id ?? steps[0]!.id;
}
