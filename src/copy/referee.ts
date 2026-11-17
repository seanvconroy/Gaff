/**
 * Every word on a referee's page (section 5 of the UX redesign, "Referees"; UX-RF-1 to UX-RF-6).
 * Plain, warm Irish English: short sentences, no jargon, no exclamation marks, no blame.
 *
 * The page asks nothing about the referee and never offers an account (UX-RF-5, Q45). There is
 * no free-text field (UX-RF-3, rule 3): the questions and their fixed answers are in
 * `src/domain/checks/checks.ts`, with the rule that says which are asked.
 *
 * The email that leads here is a fixed template (src/copy/templates/checks.ts). Its first line
 * says the form takes about two minutes (UX-RF-6).
 */
export const refereeCopy = {
  metaTitle: 'A reference',
  title: (renterName: string) => `A reference for ${renterName}`,
  /** Line one: who's asking, and why. */
  asking: (
    renterName: string,
    operator: string,
    kind: 'landlord_reference' | 'employer_reference',
  ) =>
    `${renterName} has applied to rent a home through ${operator}, and gave your name as ${
      kind === 'landlord_reference' ? 'a previous landlord' : 'their employer'
    }.`,
  /** Line two: who sees the answers, and when they're deleted. */
  kept: (operator: string) =>
    `Your answers go only to ${operator}, and are deleted once the tenancy starts or the letting closes.`,
  /** UX-PP-2: what happens next, under the form. */
  next: 'When you’ve sent it, that’s everything. Nobody will ask you for anything more.',
  send: 'Send my reference',
  /** UX-RF-2: the button once the first answer is no, and there's nothing else to ask. */
  sendShort: 'Send',
  sending: 'Sending…',
  problem: 'Choose an answer.',
  /** UX-RF-4: one tap, under the form. */
  cantGive: 'I can’t give this reference',
  telling: 'Telling them…',
  thanks: {
    title: 'Thanks',
    text: (operator: string) => `That’s everything. Your answers have gone to ${operator} only.`,
  },
  told: {
    title: 'That’s fine',
    text: (operator: string) => `We’ve told ${operator}. You won’t get any more emails about this.`,
  },
  /** The link has expired, or the renter's details have been deleted. It names nobody. */
  ended: {
    title: 'This link has ended',
    text: 'There’s nothing else you need to do.',
  },
  /** States: a send failed. Shown at the button; the answers are kept. */
  sendFailed: 'That didn’t send. Check your connection and try again.',
} as const;
