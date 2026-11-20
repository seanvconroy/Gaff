/**
 * P4: the one email Gaff's own team (STAFF_EMAILS) gets in a month when the AI has used 80% of
 * its budget. Amounts are in US dollars, as both providers bill them. It says what happens at
 * 100%, and when the AI starts again.
 */
export function aiBudgetWarningEmail(input: {
  spent: string;
  budget: string;
  /** "Tuesday 1 December", from src/lib/format.ts. */
  startsAgain: string;
}): { subject: string; text: string } {
  return {
    subject: 'Gaff’s AI has used 80% of this month’s budget',
    text: [
      `Gaff’s AI has used ${input.spent} of its ${input.budget} budget this month.`,
      '',
      `When it reaches ${input.budget}, the AI pauses and people take over its work: renters’ questions go to the letting teams, adverts are filled in by hand, and a question about who has enquired is answered only where Gaff reads it without the AI.`,
      '',
      `It starts again on ${input.startsAgain}, or as soon as you raise AI_MONTHLY_BUDGET_USD.`,
    ].join('\n'),
  };
}
