import type { OrganisationKind } from '@/domain/organisations/kinds';

/**
 * UX-HM-7: when nothing needs the person, Today says so in one line and offers one next most
 * valuable action, chosen in this order:
 *
 * 1. finish setup (the setup checklist, work package WP-27);
 * 2. add a letting, if none is live;
 * 3. invite a colleague, for an agency whose only member they are (work package WP-19);
 * 4. add viewing times for a live home that has none;
 * 5. otherwise nothing.
 *
 * At most one is ever offered, and it is never the screen's primary button (UX-HM-6).
 */
export type Suggestion =
  | { kind: 'finish_setup' }
  | { kind: 'add_letting' }
  | { kind: 'invite_colleague' }
  | { kind: 'add_viewing_times'; lettingId: string; address: string };

export type SuggestionKind = Suggestion['kind'];

/**
 * The actions Today can lead to. Every one is built: finishing setup is the checklist (WP-27),
 * inviting a colleague is teams (WP-19). Today leaves out one whose prompt the person declined
 * lately (`suggestionsAllowed` in `@/domain/activation/prompts`).
 */
export const suggestionsBuilt: readonly SuggestionKind[] = [
  'finish_setup',
  'add_letting',
  'invite_colleague',
  'add_viewing_times',
];

export function suggestedAction(
  input: {
    /** WP-27: whether the setup checklist still has a step to do. */
    setupUnfinished: boolean;
    organisationKind: OrganisationKind;
    members: number;
    lettings: ReadonlyArray<{
      id: string;
      addressLine1: string;
      status: string;
      /** Viewing times still to come. */
      viewingTimesAhead: number;
    }>;
  },
  built: readonly SuggestionKind[] = suggestionsBuilt,
): Suggestion | null {
  const live = input.lettings.filter((letting) => letting.status === 'live');
  const noTimes = live.find((letting) => letting.viewingTimesAhead === 0);
  const inOrder: Array<Suggestion | null> = [
    input.setupUnfinished ? { kind: 'finish_setup' } : null,
    live.length === 0 ? { kind: 'add_letting' } : null,
    input.organisationKind === 'agency' && input.members === 1
      ? { kind: 'invite_colleague' }
      : null,
    noTimes
      ? { kind: 'add_viewing_times', lettingId: noTimes.id, address: noTimes.addressLine1 }
      : null,
  ];
  return inOrder.find((s): s is Suggestion => s !== null && built.includes(s.kind)) ?? null;
}
