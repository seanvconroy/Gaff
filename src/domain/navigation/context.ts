import type { OrganisationKind } from '@/domain/organisations/kinds';
import type { Side } from './destinations';

/**
 * UX-AC-11 to UX-AC-13 (ADR-0016): the contexts a person has, which one is open, and how they
 * move between them. A person is one person whatever they do (UX-AC-1). Each organisation they
 * belong to is a context on the letting side: an agency or a landlord's team by its name, and a
 * private landlord's silent organisation as "My own homes" (UX-AC-4). "Renting" is one more,
 * once they've said they're looking for a home.
 *
 * These are the rules. Who a signed-in person is, and what they hold, is `currentPerson()`
 * (src/server/context/current-person.ts); what they used last is kept on their own profile.
 */

/** The key of the one context that isn't an organisation. */
export const RENTING = 'renting';

export const contextLabels = { renting: 'Renting', ownHomes: 'My own homes' } as const;

export type PersonContext =
  | { key: typeof RENTING; side: 'renting'; label: string }
  | {
      /** The organisation's ID. */
      key: string;
      side: 'letting';
      organisationId: string;
      kind: OrganisationKind;
      label: string;
    };

export type LettingContext = Extract<PersonContext, { side: 'letting' }>;

/** What a person's profile remembers of the context they used last. */
export interface LastUsed {
  side: Side | null;
  organisationId: string | null;
}

/**
 * A person's contexts, in the order the account menu lists them: agencies and teams by name, in
 * the order they joined; then "My own homes"; then "Renting".
 */
export function contextsFor(person: {
  /** The organisations they belong to, in the order they joined them. */
  organisations: ReadonlyArray<{ id: string; name: string; kind: OrganisationKind }>;
  /** Whether they've said they're looking for a home. */
  renting: boolean;
}): PersonContext[] {
  const letting = person.organisations.map(
    (organisation): LettingContext => ({
      key: organisation.id,
      side: 'letting',
      organisationId: organisation.id,
      kind: organisation.kind,
      label: organisation.kind === 'private_landlord' ? contextLabels.ownHomes : organisation.name,
    }),
  );
  return [
    ...letting.filter((context) => context.kind !== 'private_landlord'),
    ...letting.filter((context) => context.kind === 'private_landlord'),
    ...(person.renting
      ? [{ key: RENTING, side: 'renting', label: contextLabels.renting } as const]
      : []),
  ];
}

/**
 * The organisation a workspace page works for: the one they let for last, if they still belong
 * to it, else the first. A workspace page is on the letting side whatever side was open last.
 */
export function lettingContext(
  contexts: readonly PersonContext[],
  last: LastUsed,
): LettingContext | null {
  const letting = contexts.filter((context): context is LettingContext => context.side === 'letting');
  return letting.find((context) => context.key === last.organisationId) ?? letting[0] ?? null;
}

/** UX-AC-11: the context that is open: the one used last, if they still have it; else the first. */
export function currentContext(
  contexts: readonly PersonContext[],
  last: LastUsed,
): PersonContext | null {
  const renting = contexts.find((context) => context.side === 'renting') ?? null;
  if (last.side === 'renting' && renting) return renting;
  if (last.side === 'letting') return lettingContext(contexts, last) ?? renting;
  return contexts[0] ?? null;
}

export type Switcher =
  /** UX-AC-12: one context, or none: nothing to switch between. */
  | { kind: 'none' }
  /** Just letting and renting: one row, "Switch to renting" or "Switch to letting". */
  | { kind: 'toggle'; to: string; label: string }
  /** More than two, or two places to let: each by name, one tap to switch. */
  | { kind: 'list'; contexts: Array<{ key: string; label: string; current: boolean }> };

export const switchLabels = {
  letting: 'Switch to letting',
  renting: 'Switch to renting',
} as const;

/** UX-AC-11, UX-AC-12: what the top of the account menu offers for moving between contexts. */
export function switcherFor(
  contexts: readonly PersonContext[],
  current: PersonContext | null,
): Switcher {
  if (contexts.length < 2) return { kind: 'none' };
  const others = contexts.filter((context) => context.key !== current?.key);
  const other = others[0];
  if (contexts.length === 2 && current && other && other.side !== current.side) {
    return { kind: 'toggle', to: other.key, label: switchLabels[other.side] };
  }
  return {
    kind: 'list',
    contexts: contexts.map((context) => ({
      key: context.key,
      label: context.label,
      current: context.key === current?.key,
    })),
  };
}

/** A context a person can add from the account menu (UX-AC-13). */
export type AddableContext = 'renting' | 'own_homes' | 'agency';

/**
 * UX-AC-8, UX-AC-13: whatever a person chose at first run, the other roles stay one tap away:
 * "Find a home to rent", "Let a home I own", "Join or set up an agency". Each is offered until
 * they have it.
 */
export function addableContexts(contexts: readonly PersonContext[]): AddableContext[] {
  const has = (test: (context: PersonContext) => boolean) => contexts.some(test);
  return [
    ...(has((context) => context.side === 'renting') ? [] : (['renting'] as const)),
    ...(has((context) => context.side === 'letting' && context.kind === 'private_landlord')
      ? []
      : (['own_homes'] as const)),
    ...(has((context) => context.side === 'letting' && context.kind === 'agency')
      ? []
      : (['agency'] as const)),
  ];
}

/** Where each side opens, and where its wordmark leads. */
export function homeFor(side: Side): '/today' | '/' {
  return side === 'letting' ? '/today' : '/';
}

/**
 * UX-AC-10: the way out of first run for someone who has no context yet: the public site, to
 * look around. Nothing is chosen for them; the next time they open Gaff, first run is where
 * they left it.
 */
export const lookAroundHref = '/?rent=1';

/**
 * "List a home": adding a letting. Someone who lets nothing yet becomes a private landlord there
 * without being asked anything (UX-AC-4, UX-AC-7).
 */
export const listAHomeHref = '/lettings/new';

/** "List a home" for a signed-out visitor: sign-in first, then on to adding a letting (UX-SI-8). */
export const listAHomeSignedOutHref = `/sign-in?next=${encodeURIComponent(listAHomeHref)}`;

/**
 * `/` is the public site's first screen, Search on the renting side, and where sign-in lands. So
 * it sends people on:
 *
 * - someone letting goes to Today (UX-HM-1);
 * - someone renting stays: this is Search (UX-NV-19);
 * - someone signed in with no context yet goes to first run (UX-SI-8), unless they left it to
 *   look around (UX-AC-10);
 * - a signed-out visitor stays (UX-NV-20).
 */
export function firstScreenRedirect(
  person: { side: Side | null } | null,
  query: { rent?: string | string[] },
): '/today' | '/welcome' | null {
  if (person === null) return null;
  if (person.side === 'letting') return '/today';
  if (person.side === 'renting') return null;
  return query.rent === '1' ? null : '/welcome';
}
