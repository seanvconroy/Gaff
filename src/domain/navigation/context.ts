import type { Side } from './destinations';

/** Which side of Gaff a signed-in person is using now: running lettings, or renting. */
export type Context = Side;

/**
 * THE RULE, FOR NOW: a member of an organisation is letting; anyone else is renting.
 *
 * This is the one place it lives. Work package WP-5 replaces it with the real switcher
 * (UX-AC-11 to UX-AC-13): a person can hold several contexts, each agency by name, "My own
 * homes" and "Renting", and Gaff reopens the one they used last. Everything else asks
 * `currentPerson()` (src/server/context/current-person.ts), which asks this.
 */
export function contextFor(person: { memberOfAnOrganisation: boolean }): Context {
  return person.memberOfAnOrganisation ? 'letting' : 'renting';
}

/** Where each side opens, and where its wordmark leads. */
export function homeFor(context: Context): '/today' | '/' {
  return context === 'letting' ? '/today' : '/';
}

/**
 * "Find a home to rent", for someone who only lets (UX-NV-8): the public site, for anyone who
 * asks for it this way. Until WP-5 lets a person hold both contexts, it is how the public site
 * is shown to someone who would otherwise be sent on from `/`.
 */
export const findAHomeHref = '/?rent=1';

/** "List a home" for someone signed in: adding a letting, which starts with set-up if needed. */
export const listAHomeHref = '/lettings/new';

/** "List a home" for a signed-out visitor: sign-in first, then on to adding a letting (UX-SI-8). */
export const listAHomeSignedOutHref = `/sign-in?next=${encodeURIComponent(listAHomeHref)}`;

/**
 * `/` is the public site's first screen, and where sign-in lands. So it sends people on:
 *
 * - someone letting goes to Today (UX-HM-1);
 * - someone signed in who lets nothing yet goes to set-up, as signing in always has. FOR NOW:
 *   nobody can choose to be a renter yet. Work package WP-5 builds first run, and then `/` is
 *   Search for a renter (UX-NV-19);
 * - a signed-out visitor stays (UX-NV-20), and so does anyone who asked to find a home to rent.
 */
export function firstScreenRedirect(
  context: Context | null,
  query: { rent?: string | string[] },
): '/today' | '/welcome' | null {
  if (context === null || query.rent === '1') return null;
  return context === 'letting' ? '/today' : '/welcome';
}
