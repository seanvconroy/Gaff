import { loadLetting } from '@/app/(workspace)/lettings/[lettingId]/letting';

/**
 * WP-17: every decision flow starts here, as every page of a letting does: a signed-in member of
 * the letting's organisation, the letting, and a member who applied for the home themselves
 * turned away (UX-AC-14). The decision itself is made by a use case in `src/server`, which
 * creates its `PersonDecision` through `src/server/decisions` (ADR-0007).
 */
export async function loadDecision(params: Promise<{ lettingId: string }>) {
  const loaded = await loadLetting(params);
  const lettingHref = `/lettings/${loaded.letting.id}`;
  return { ...loaded, lettingHref };
}

/** A query value that may come once or several times, as a list. */
export function many(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).flatMap((v) => v.split(',')).filter(Boolean);
}

/** A query value that should come once. */
export function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
