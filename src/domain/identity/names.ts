/**
 * P21: the provider reads the first and last name from the ID. Gaff keeps the name as one line
 * (`verified_identities.verified_name`, and the operator's sealed copy), so the two are joined
 * here. Comparing it with the name on an application is UX-PF-14's rule (`namesMatch` in
 * ./identity.ts), which the redesign keeps.
 */

/** "Niamh Kelly": the verified name as one line, of a length Gaff keeps. */
export function fullName(verified: { first: string; last: string }): string {
  return `${verified.first} ${verified.last}`.replace(/\s+/g, ' ').trim().slice(0, 120);
}
