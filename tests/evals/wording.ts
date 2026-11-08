import { confirmedFindings } from '@/domain/ai/validators';
import type { WordingFinding } from '@/ports/ai';

/**
 * P6: the golden set for the unfair-wording check (ADR-0023). 80 listings with wording that
 * excludes people on a protected ground, directly or indirectly, and 80 with fair wording that
 * must not be flagged. Pass mark: at least 90% of the unfair ones caught, and no more than 5% of
 * the fair ones flagged.
 */

const openings = [
  'Bright two-bedroom apartment in a quiet block, with gas central heating and a balcony.',
  'Three-bed semi-detached house with a private back garden and off-street parking.',
];

const unfair = [
  'No children.',
  'Irish nationals only.',
  'No rent allowance.',
  'No HAP.',
  'Not suitable for those on social welfare.',
  'Professionals only.',
  'Would suit a professional couple.',
  'Ideal for a young professional.',
  'Mature tenants preferred.',
  'Suit a quiet couple.',
  'Perfect for a single professional woman.',
  'No DSS.',
  'Tenants must be in full-time employment.',
  'Must be working.',
  'Not suitable for families.',
  'Christian household preferred.',
  'Would suit a retired couple.',
  'No students or families.',
  'Ideal for a working couple with no kids.',
  'Suits someone under 35.',
  'Over 40s only.',
  'English speakers only.',
  'No Travellers.',
  'Suitable for an able-bodied tenant.',
  'Married couples only.',
  'Female only.',
  'Male tenants only.',
  'No single parents.',
  'No pregnant tenants.',
  'Suit a gentleman.',
  'Would suit a nurse or a garda.',
  'No housing assistance.',
  'Would suit a young family with no pets.',
  'Ideal for a couple without children.',
  'EU citizens only.',
  'Not suitable for wheelchair users.',
  'Suits a quiet, mature professional.',
  'Locals preferred.',
  'Must have a permanent job.',
  'Employed applicants only.',
];

const fair = [
  'Family bathroom upstairs.',
  'Suits up to three people.',
  'No pets.',
  'Non-smoking.',
  'Suitable for wheelchair users, with step-free access.',
  'Close to schools and shops.',
  'Quiet cul-de-sac.',
  'References required.',
  'Deposit of one month’s rent.',
  'Two double bedrooms.',
  'Minimum lease of 12 months.',
  'Available from 1 December.',
  'HAP welcome.',
  'Everyone who meets the criteria is welcome to apply.',
  'Ground-floor bedroom and a level-access shower.',
  'Bike storage at the entrance.',
  'Walking distance to the university.',
  'Near the Luas and several bus routes.',
  'Maximum three occupants.',
  'One small pet considered.',
  'Fully furnished, with a dishwasher.',
  'Viewings on weekday evenings.',
  'Rent is due monthly in advance.',
  'Garden maintenance is included.',
  'Gas central heating and double glazing.',
  'Bins collected every Tuesday.',
  'Parking for one car.',
  'Fibre broadband available.',
  'South-facing garden.',
  'Recently renovated kitchen.',
  'Quiet residential area.',
  'Lift to all floors.',
  'Close to a playground and a park.',
  'Assistance dogs are always welcome.',
  'Suits a home office, with a third small bedroom.',
  'Short walk to the beach.',
  'Electric storage heaters.',
  'Communal laundry room.',
  'Registered with the RTB.',
  'A spacious family home with four bedrooms.',
];

export interface WordingCase {
  text: string;
  phrase: string;
  unfair: boolean;
}

export const cases: WordingCase[] = openings.flatMap((opening) => [
  ...unfair.map((phrase) => ({ text: `${opening} ${phrase}`, phrase, unfair: true })),
  ...fair.map((phrase) => ({ text: `${opening} ${phrase}`, phrase, unfair: false })),
]);

/** A case counts as flagged if a confirmed finding touches the phrase it was built around. */
export function flagged(item: WordingCase, findings: readonly WordingFinding[]): boolean {
  const kept = confirmedFindings(findings, item.text);
  return kept.some(
    (f) => item.phrase.includes(f.phrase) || f.phrase.includes(item.phrase.replace(/\.$/, '')),
  );
}

export function summarise(results: Array<{ unfair: boolean; flagged: boolean }>) {
  const unfairCases = results.filter((r) => r.unfair);
  const fairCases = results.filter((r) => !r.unfair);
  const caught = unfairCases.filter((r) => r.flagged).length / unfairCases.length;
  const falseAlarms = fairCases.filter((r) => r.flagged).length / fairCases.length;
  return {
    unfair: unfairCases.length,
    fair: fairCases.length,
    caught: Math.round(caught * 1000) / 10,
    falseAlarms: Math.round(falseAlarms * 1000) / 10,
    passed: caught >= 0.9 && falseAlarms <= 0.05,
  };
}
