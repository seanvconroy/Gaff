import { homeHref } from '@/domain/homes/home-page';
import { type FlowStep, stepSlugs } from '@/domain/lettings/add-letting';
import { returnPath } from '@/domain/navigation/return-to';

/**
 * Where each screen of adding a letting lives. A home keeps one ID from its first answer to
 * going live, so every step is `/lettings/<id>/setup/<step>`, whether it is still a draft or
 * already a letting. `from` is the page the task was opened on (UX-NV-6): it rides along, so
 * Close and "Save and exit" go back there from any step.
 */
/**
 * Screens beyond the steps: the review, the rent check's result, the question after go-live,
 * and M38's "Where is it on the map?", which follows the address (it is part of that step).
 */
export type FlowScreen = FlowStep | 'review' | 'rent_result' | 'advertised' | 'pin';

const slugs: Record<FlowScreen, string> = {
  ...stepSlugs,
  review: 'review',
  rent_result: 'rent-result',
  advertised: 'advertised',
  pin: 'pin',
};

export function screenFromSlug(slug: string): FlowScreen | null {
  return (Object.keys(slugs) as FlowScreen[]).find((screen) => slugs[screen] === slug) ?? null;
}

const withQuery = (path: string, query: Record<string, string | null | undefined>) => {
  const search = new URLSearchParams(
    Object.entries(query).filter((entry): entry is [string, string] => Boolean(entry[1])),
  ).toString();
  return search ? `${path}?${search}` : path;
};

/** The first screen. With `draft`, it carries on a draft that has only a link so far. */
export function startHref(from?: string | null, draft?: string | null): string {
  return withQuery('/lettings/new', { draft, from });
}

/** The address step before anything has been saved: there is no draft, so no ID, yet. */
export function firstAddressHref(from?: string | null): string {
  return withQuery('/lettings/new/address', { from });
}

export function screenHref(
  id: string,
  screen: FlowScreen,
  from?: string | null,
  query: Record<string, string | null | undefined> = {},
): string {
  return withQuery(`/lettings/${id}/setup/${slugs[screen]}`, { ...query, from });
}

/** Wherever the person left off (the page works it out). */
export function resumeHref(id: string, from?: string | null): string {
  return withQuery(`/lettings/${id}/setup`, { from });
}

/** UX-TS-4: why a home is off gaff.ie, and "Ask Gaff to look again". */
export function hiddenHref(id: string): string {
  return `/lettings/${id}/hidden`;
}

/** BA-10 (M107): why a lister's listings are paused, and "Ask Gaff to look again". */
export const pausedHref = '/paused';

/** The `from` a page was given, if it is a plain path inside Gaff. Anything else is dropped. */
export function fromOf(value: string | string[] | undefined): string | null {
  return returnPath(value, '') || null;
}

/**
 * WP-17: the focused flows for the decisions on a letting, each under `(task)`:
 * - `who-views`: choose who views (UX-DC-1 to UX-DC-6);
 * - `choose`: choose an applicant, and a backup (UX-DC-7 to UX-DC-9);
 * - `checks`: the checks, and once they're back the one screen to read them (UX-DC-10 to 13);
 * - `approval`: ask the owner to approve, or record that they have (UX-DC-14 to UX-DC-16);
 * - `offer`: the offer (UX-DC-17 to UX-DC-20).
 */
export type DecisionFlow = 'who-views' | 'choose' | 'checks' | 'approval' | 'offer';

/** M49 (BA-13): "Is it still available?", signed in, from Today or the letting. */
export function stillAvailableHref(lettingId: string): string {
  return `/lettings/${lettingId}/still-available`;
}

export function decisionHref(
  lettingId: string,
  flow: DecisionFlow,
  query: Record<string, string | null | undefined> = {},
): string {
  return withQuery(`/lettings/${lettingId}/${flow}`, query);
}

/**
 * UX-LP-5: "See it on Gaff", in a letting's menu: only for a home that has a public page now
 * (live, on gaff.ie, and everything its page needs). The address is the page's own (UX-LS-1).
 */
export function seeItOnGaffHref(home: { publicRef: string; shownOnGaff: boolean }): string | null {
  return home.shownOnGaff ? homeHref(home.publicRef) : null;
}
