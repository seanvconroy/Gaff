import { TZDate } from '@date-fns/tz';
import type { OrganisationKind } from '@/domain/organisations/kinds';
import { TIME_ZONE } from '@/lib/format';

/**
 * "Mine" and "Everyone" (section 3, "How Today differs by user"; UX-HM-11; UX-AG-8, UX-AG-9).
 *
 * - Today shows a person what they lead. An admin of a team can switch to "Everyone": their own
 *   things, plus anything that has waited more than one working day on anyone else, each with
 *   its lead's name. It is for reading first; an admin can still open and do any of them.
 * - Lettings opens on the homes a person leads. Every member of a team can see every home it
 *   runs (UX-AG-8), so every member of a team can switch Lettings to "Everyone".
 * - A private landlord, and a team of one, have nobody else's to see: no switch.
 *
 * Something that belongs to no home (an email Gaff couldn't place), or to a home with no lead,
 * is everybody's: it shows in each person's "Mine", so it can never sit unseen.
 */
export type View = 'mine' | 'everyone';

export interface Viewer {
  userId: string;
  role: 'admin' | 'negotiator';
  organisationKind: OrganisationKind;
  /** How many people belong to the organisation. */
  members: number;
}

const inATeam = (viewer: Viewer) =>
  viewer.organisationKind !== 'private_landlord' && viewer.members > 1;

/** UX-HM-11: the views of Today this person can choose between. One view means no switch. */
export function todayViews(viewer: Viewer): View[] {
  return inATeam(viewer) && viewer.role === 'admin' ? ['mine', 'everyone'] : ['mine'];
}

/** UX-AG-8: the views of Lettings this person can choose between. One view means no switch. */
export function lettingsViews(viewer: Viewer): View[] {
  return inATeam(viewer) ? ['mine', 'everyone'] : ['mine'];
}

/** The view to show: the one asked for in the address if this person has it, otherwise "Mine". */
export function chosenView(asked: string | undefined, allowed: readonly View[]): View {
  return asked === 'everyone' && allowed.includes('everyone') ? 'everyone' : 'mine';
}

interface Led {
  leadUserId: string | null;
}

/** Whether this is the person's own: they lead it, or nobody does. */
export function isMine(thing: Led, userId: string): boolean {
  return thing.leadUserId === null || thing.leadUserId === userId;
}

const isWeekend = (day: number) => day === 0 || day === 6;

/**
 * When something that started waiting at `since` has waited one working day, in Irish time.
 * Monday to Friday count; a weekend doesn't. So Friday 3pm is up on Monday 3pm, and anything
 * that arrives on a weekend is up at the end of Monday. Bank holidays aren't counted yet.
 */
export function oneWorkingDayAfter(since: Date): Date {
  let start = new TZDate(since, TIME_ZONE);
  if (isWeekend(start.getDay())) {
    // The clock starts with the working week: midnight as Monday begins.
    const daysToMonday = start.getDay() === 6 ? 2 : 1;
    start = new TZDate(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + daysToMonday,
      TIME_ZONE,
    );
  }
  const due = new TZDate(start, TIME_ZONE);
  due.setDate(due.getDate() + (start.getDay() === 5 ? 3 : 1));
  return new Date(due.getTime());
}

/** Section 3: "anything waiting more than one working day". Unknown counts as waiting. */
export function waitedOverAWorkingDay(since: Date | null, now: Date): boolean {
  return since === null || oneWorkingDayAfter(since).getTime() < now.getTime();
}

/** What a person sees on Today in each view. The order it arrives in is kept (UX-HM-4). */
export function todayIn<T extends Led & { since: Date | null }>(
  view: View,
  items: readonly T[],
  viewer: { userId: string },
  now: Date,
): T[] {
  return items.filter(
    (item) =>
      isMine(item, viewer.userId) ||
      (view === 'everyone' && waitedOverAWorkingDay(item.since, now)),
  );
}

/** The homes a person sees on Lettings in each view. */
export function lettingsIn<T extends Led>(
  view: View,
  lettings: readonly T[],
  viewer: { userId: string },
): T[] {
  return view === 'everyone' ? [...lettings] : lettings.filter((l) => isMine(l, viewer.userId));
}
