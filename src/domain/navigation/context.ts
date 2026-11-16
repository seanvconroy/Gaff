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
