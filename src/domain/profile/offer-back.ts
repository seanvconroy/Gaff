import type { Earning } from '@/domain/applications/apply';
import type { CriterionQuestion } from '@/domain/criteria/criteria';
import type { RenterView } from '@/domain/renter/path';
import type { KeptAnswers, KeptDetails } from './kept';

/**
 * UX-PF-3, UX-PF-5, UX-RN-11 (rule 2, P7): kept details are offered back to the person, for them
 * to confirm ("Is this still right?"). These rules say what is offered, and when. They never send
 * anything: an operator sees an answer only once the renter presses the button that sends it,
 * on the page of the stage that collects it.
 *
 * Staged data holds for a profile exactly as it does without one:
 * - the four answers are offered only on the questions page, and only for questions that home asks;
 * - how they earn and their income are offered only on the application, after they came to view;
 * - nothing else is ever offered, and references are asked for afresh each time (UX-PF-5, Q35).
 */

/**
 * The kept answers to offer on one home's questions: only the questions it asks. A move-in date
 * that has passed can't still be right, so it is left for them to answer again.
 */
export function answersToOffer(
  kept: KeptAnswers,
  asked: readonly CriterionQuestion[],
  today: string,
): KeptAnswers {
  const offer: KeptAnswers = {};
  if (asked.includes('occupants') && kept.occupants !== undefined) offer.occupants = kept.occupants;
  if (asked.includes('hasPets') && kept.hasPets !== undefined) offer.hasPets = kept.hasPets;
  if (asked.includes('stayMonths') && kept.stayMonths !== undefined) {
    offer.stayMonths = kept.stayMonths;
  }
  if (asked.includes('moveInDate') && kept.moveInDate !== undefined && kept.moveInDate >= today) {
    offer.moveInDate = kept.moveInDate;
  }
  return offer;
}

/**
 * Whether every question this home asks has a kept answer: then the renter opens on one screen
 * with their answers, each with "Change", and confirms. Otherwise the questions are asked one per
 * screen as ever, with what is known already filled in.
 */
export function coversEveryQuestion(
  offered: KeptAnswers,
  asked: readonly CriterionQuestion[],
): boolean {
  return asked.length > 0 && asked.every((question) => offered[question] !== undefined);
}

export interface IncomeOffer {
  earning: Earning;
  monthlyIncomeCents: number;
  /** UX-PF-5: when they said so. Shown beside the figure, so a stale one is seen to be stale. */
  saidOn: Date;
}

/**
 * UX-PF-5, UX-RN-11: the kept income to offer on an application. Only at the stage that asks for
 * it (someone who came to view and hasn't applied yet), and only with the date they said it.
 * Someone who has applied sees what their application holds, which is theirs to change.
 */
export function incomeToOffer(kept: KeptDetails, view: RenterView): IncomeOffer | null {
  if (view !== 'after_viewing') return null;
  if (!kept.earning || !kept.monthlyIncomeCents || !kept.incomeAt) return null;
  return {
    earning: kept.earning,
    monthlyIncomeCents: kept.monthlyIncomeCents,
    saidOn: kept.incomeAt,
  };
}

/** A kept income as the application's field takes it: "3,200" or "3,200.50". */
export function incomeAsTyped(cents: number): string {
  return (cents / 100).toLocaleString('en-IE', {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/**
 * UX-PF-2, UX-RN-13: what the application's check screen says about keeping.
 *
 * - `tick`: someone with no profile here (signed out, or signed in but this enquiry isn't shown
 *   to be theirs) sees one tick, off by default: "Keep my details for next time".
 * - `on`: someone whose enquiry this is, and who keeps what they enter: one line says so.
 * - `off`: they switched keeping off in Profile: nothing is kept, and nothing is said.
 */
export type Keeping = 'tick' | 'on' | 'off';

export function keepingFor(person: { theirs: boolean; keepsDetails: boolean } | null): Keeping {
  if (!person || !person.theirs) return 'tick';
  return person.keepsDetails ? 'on' : 'off';
}
