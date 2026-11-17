/**
 * UX-TN-5 to UX-TN-7 (R28, Q15): what closing a let home shows. The results screen is where
 * results live: the days it took from the first enquiry, and the time saved against the
 * person's usual. It offers exactly one next action.
 */

export type NextAfterLet = 'send_owner_summary' | 'invite_colleague' | 'add_letting';

/**
 * UX-TN-6: one next action, in this order: send the owner the summary (an agency's home whose
 * owner hasn't seen it); invite a colleague (an agency of one); add the next letting.
 */
export function nextAfterLet(input: {
  kind: 'agency' | 'landlord' | 'private_landlord';
  /** The owner has opened their page since the home was let. */
  ownerHasSeenSummary: boolean;
  members: number;
}): NextAfterLet {
  if (input.kind === 'agency' && !input.ownerHasSeenSummary) return 'send_owner_summary';
  if (input.kind === 'agency' && input.members <= 1) return 'invite_colleague';
  return 'add_letting';
}

/**
 * UX-TN-7: "your usual" is two questions with tap answers, asked at the first close if it
 * wasn't set during a pilot's onboarding. Each answer is a round number Gaff compares with.
 */
export const usualDaysChoices = [
  { value: 14, label: 'About 2 weeks' },
  { value: 30, label: 'About a month' },
  { value: 45, label: 'About 6 weeks' },
  { value: 60, label: '2 months or more' },
] as const;

export const usualHoursChoices = [
  { value: 5, label: 'About 5 hours' },
  { value: 10, label: 'About 10 hours' },
  { value: 15, label: 'About 15 hours' },
  { value: 20, label: '20 hours or more' },
] as const;

export type UsualQuestion = 'days' | 'hours';

/** The question still to ask, in order, or null once both are known. */
export function usualStillToAsk(usual: {
  daysToLet: number | null;
  minutesPerLetting: number | null;
}): UsualQuestion | null {
  if (usual.daysToLet === null) return 'days';
  if (usual.minutesPerLetting === null) return 'hours';
  return null;
}

/** Parses a tap answer: only the offered values are taken. */
export function usualAnswer(question: UsualQuestion, value: string): number | null {
  const choices = question === 'days' ? usualDaysChoices : usualHoursChoices;
  const found = choices.find((choice) => String(choice.value) === value);
  return found ? found.value : null;
}

/** "About 5 hours", "About 45 minutes": time saved, rounded as a person would say it. */
export function timeInWords(minutes: number): string {
  if (minutes < 60) {
    const rounded = Math.max(5, Math.round(minutes / 5) * 5);
    return `About ${rounded} minutes`;
  }
  const halfHours = Math.round(minutes / 30) / 2;
  if (halfHours === 1) return 'About an hour';
  return `About ${halfHours} hours`;
}

export interface LetResults {
  daysToLet: number | null;
  usualDays: number | null;
  /** Minutes saved against the usual; null when the usual isn't known. */
  minutesSaved: number | null;
}

/** UX-TN-5: "9 days from first enquiry. You usually take 30." and the time saved, in words. */
export function resultLines(results: LetResults): { days: string | null; time: string | null } {
  const days =
    results.daysToLet === null
      ? null
      : `${results.daysToLet === 1 ? '1 day' : `${results.daysToLet} days`} from first enquiry.${
          results.usualDays === null ? '' : ` You usually take ${results.usualDays}.`
        }`;
  const time =
    results.minutesSaved === null || results.minutesSaved <= 0
      ? null
      : `${timeInWords(results.minutesSaved)} of your time saved.`;
  return { days, time };
}
