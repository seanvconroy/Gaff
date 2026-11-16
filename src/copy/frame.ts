import { possessive } from './templates/first-reply';

/**
 * The words of the frame round every private page (UX-PP-1 to UX-PP-10): the pages a renter, a
 * tenant, an owner or a referee reaches by a link. Plain, warm Irish English; no line of caution
 * and no standing disclaimer (UX-PP-6, Q46). The page's own task and words are the page's.
 */
export const frameCopy = {
  letBy: (listerName: string) => `Let by ${listerName}`,
  whatHappensNext: 'What happens next',
  licence: (number: string) => `PSRA licence ${number}`,
  /** The same words the first reply uses for the privacy notice. */
  privacy: 'How we use your details',
  /** UX-PP-9 (Q45): one quiet line on an owner's or a referee's page. Never an invitation. */
  runWithGaff: 'Run with Gaff',
  /** An owner or a referee isn't a renter: they're told how to reach the agency itself. */
  reachLister: (listerName: string, phone: string | null) =>
    phone
      ? `To reach ${listerName}, reply to their email or ring ${phone}.`
      : `To reach ${listerName}, reply to their email.`,
} as const;

/** UX-PP-3, UX-AI-2 (rule 6): "Talk to a person", on every renter's page. */
export const talkCopy = {
  button: 'Talk to a person',
  title: 'Talk to a person',
  emailTitle: 'Reply to any email',
  emailText: (listerName: string | null) =>
    listerName
      ? `Reply to any email from us and say you’d like to talk to a person. Someone at ${listerName} will answer you.`
      : 'Reply to any email from us and say you’d like to talk to a person. Someone will answer you.',
  phoneTitle: (listerName: string | null) => (listerName ? `Ring ${listerName}` : 'Ring us'),
  ring: (number: string) => `Ring ${number}`,
  done: 'Done',
} as const;

/**
 * UX-AI-1, UX-AI-15: how anything the assistant wrote is marked, on a page or in an email. To a
 * renter the assistant is the lister's: "Halcyon Lettings’ AI assistant". There is no persona.
 */
export function fromAssistant(listerName: string): string {
  return `From ${possessive(listerName)} AI assistant`;
}
