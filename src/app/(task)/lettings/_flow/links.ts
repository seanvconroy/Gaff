import { type FlowStep, stepSlugs } from '@/domain/lettings/add-letting';
import { returnPath } from '@/domain/navigation/return-to';

/**
 * Where each screen of adding a letting lives. A home keeps one ID from its first answer to
 * going live, so every step is `/lettings/<id>/setup/<step>`, whether it is still a draft or
 * already a letting. `from` is the page the task was opened on (UX-NV-6): it rides along, so
 * Close and "Save and exit" go back there from any step.
 */
export type FlowScreen = FlowStep | 'review' | 'rent_result' | 'advertised';

const slugs: Record<FlowScreen, string> = {
  ...stepSlugs,
  review: 'review',
  rent_result: 'rent-result',
  advertised: 'advertised',
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

/** The `from` a page was given, if it is a plain path inside Gaff. Anything else is dropped. */
export function fromOf(value: string | string[] | undefined): string | null {
  return returnPath(value, '') || null;
}
