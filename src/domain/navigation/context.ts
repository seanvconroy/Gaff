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
 * "Find a home to rent", for someone who only lets (UX-NV-8). Until WP-5 lets a person hold both
 * contexts, it opens the public site without sending them straight back to Today.
 */
export const findAHomeHref = '/?rent=1';

/** "List a home", signed out or renting: adding a letting, which asks for sign-in first. */
export const listAHomeHref = '/lettings/new';

/**
 * `/` is the public site's first screen, and where sign-in lands. Someone letting goes on to
 * Today (UX-HM-1), unless they asked to find a home to rent. Everyone else stays.
 */
export function firstScreenRedirect(
  context: Context | null,
  query: { rent?: string | string[] },
): '/today' | null {
  if (context !== 'letting') return null;
  return query.rent === '1' ? null : '/today';
}
