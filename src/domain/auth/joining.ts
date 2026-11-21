import { z } from 'zod';
import { signInProviderSchema, type SignInMethod, type SignInProvider } from './methods';

/**
 * UX-SI-15: one person, however they sign in (ADR-0033). A sign-in code sent to an email
 * address can carry one more way in, to be joined to whoever proves that address: a Google or
 * Apple account that couldn't vouch for the address itself (ADR-0019, AU4).
 *
 * The email address is what joins them. Nothing is joined until the mailbox says yes with the
 * code, in the browser that asked, so nobody gets into an account by knowing its address.
 */
export const joiningSchema = z.object({
  provider: z.object({
    id: signInProviderSchema,
    /** The provider's own ID for the person. */
    accountId: z.string().min(1).max(255),
    /** The name the provider gave, for a person who has none yet. */
    name: z.string().max(200).optional(),
  }),
});
export type Joining = z.infer<typeof joiningSchema>;

/** What a code's row says it joins, or null if it joins nothing (or holds anything else). */
export function readJoining(value: unknown): Joining | null {
  if (value === null || value === undefined) return null;
  const parsed = joiningSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** A way in that was joined to an account as its owner signed in. */
export type Joined = SignInProvider;

export function joinedFrom(value: unknown): Joined | null {
  return value === 'google' || value === 'apple' ? value : null;
}

/**
 * The method a sign-in counts as, for the funnel and for "You used … last time": the one the
 * person chose. Someone who chose Google, and proved their email on the way, chose Google.
 * (The session itself records the proof that made it.)
 */
export function methodChosen(proof: SignInMethod, joined: Joined | null): SignInMethod {
  return joined ?? proof;
}

/**
 * Whether "We've found your account" is shown: something was joined to an account that was
 * already there. A person made a moment ago goes straight on to set up.
 */
export function foundAccount(input: { existed: boolean; joined: Joined | null }): Joined | null {
  return input.existed ? input.joined : null;
}
