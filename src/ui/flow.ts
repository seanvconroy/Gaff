/** Small rules every step-by-step flow shares (section 4, UX-FL-3), tested without a browser. */

/** What a screen reader hears when a step has errors: "2 things need another look". */
export function needAnotherLook(count: number): string {
  return count === 1 ? '1 thing needs another look' : `${count} things need another look`;
}

/**
 * Which of a step's fields to show an error on when the user leaves one. Only the field they
 * left, only if they typed something there: a field left empty is marked when the primary button
 * is pressed, not while someone is still finding their way round the step.
 */
export function problemOnLeaving(
  field: { name: string; value: string },
  problems: Readonly<Record<string, string>>,
): string | null {
  if (!field.name || field.value.trim() === '') return null;
  return problems[field.name] ?? null;
}

/**
 * Moves focus to the first field marked as wrong, once the page has drawn the errors. A picker
 * is a button, which can't be `aria-invalid`, so it carries `data-invalid` instead.
 */
export function focusFirstProblem(within: ParentNode | null): void {
  requestAnimationFrame(() => {
    within
      ?.querySelector<HTMLElement>('[aria-invalid="true"], button[data-invalid]')
      ?.focus();
  });
}
