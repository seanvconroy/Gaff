import { funnelSubjectSchema, type FunnelVariant } from '@/domain/funnels/steps';
import { noteFunnelStep } from '@/server/funnels/steps';
import { findMember } from './member';

/**
 * UX-ME-1: the sign-in funnel (screen opened, method chosen, signed in). Nobody is known when
 * the screen opens, so what's counted is one try at signing in: a random ID made with the page
 * and carried in the form and the sign-in link. It isn't a cookie, nothing is kept on the device,
 * and it says nothing about who is signing in.
 */
type SignInMethod = Extract<
  FunnelVariant,
  'email_link' | 'email_code' | 'google' | 'apple' | 'passkey'
>;

/** The ID of a try at signing in, if what came back from the browser is one. */
export function signInAttempt(value: unknown): string | null {
  const parsed = funnelSubjectSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function noteSignInScreenOpened(attempt: unknown): Promise<void> {
  const subjectId = signInAttempt(attempt);
  if (subjectId) await noteFunnelStep({ step: 'sign_in.screen_opened', subjectId });
}

export async function noteSignInMethodChosen(
  attempt: unknown,
  method: SignInMethod,
): Promise<void> {
  const subjectId = signInAttempt(attempt);
  if (subjectId) {
    await noteFunnelStep({ step: 'sign_in.method_chosen', subjectId, variant: method });
  }
}

/**
 * The person is signed in. That ends the sign-in funnel for this try, and, for someone who
 * hasn't set up yet, starts first run (signed in, then set-up finished), counted once a person.
 */
export async function noteSignedIn(
  attempt: unknown,
  user: { id: string },
  method: SignInMethod,
): Promise<void> {
  const subjectId = signInAttempt(attempt);
  if (subjectId) await noteFunnelStep({ step: 'sign_in.signed_in', subjectId, variant: method });
  if (!(await findMember(user.id))) {
    await noteFunnelStep({ step: 'first_run.signed_in', subjectId: user.id });
  }
}
