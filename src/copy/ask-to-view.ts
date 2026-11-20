import { possessive } from '@/copy/templates/first-reply';

/**
 * The words of asking to view, from a home's page on Gaff (section 5, "Asking to view";
 * UX-AV-1 to UX-AV-9). Plain, warm Irish English; no exclamation marks; nothing to hurry anyone.
 * There's no line of caution on these screens: none is needed by the law here (UX-PP-6, Q46).
 * The questions themselves are the private page's (`questionsCopy` in `./renter`), so a question
 * is asked in the same words wherever it is asked.
 */
export const askCopy = {
  pageTitle: 'Ask to view',
  progress: 'Asking to view',
  close: 'Back to the home',
  next: 'Next',
  back: 'Back',
  done: 'Done',
  change: 'Change',
  contact: {
    name: 'You',
    title: 'Who should we reply to?',
    /** UX-AV-1: no account needed. */
    lead: 'A name and an email are enough. You don’t need an account.',
    fullName: 'Your name',
    email: 'Your email',
    emailHint: 'We’ll send the reply here.',
    /** "Continue with Google" or "Apple", which fill both. */
    or: 'Or',
  },
  check: {
    name: 'Check',
    title: 'Is this right?',
    /** UX-AV-3: "You searched for 2 people. Is that right?" */
    fromSearch: (what: string) => `You searched for ${what}.`,
    /** UX-PF-3: kept answers, offered back. */
    fromProfile: 'From your profile. Change anything that’s different now.',
    changeLabel: (what: string) => `Change ${what}`,
  },
  question: {
    name: 'Question',
    title: 'Anything to ask about the home?',
    /** UX-AV-5: a question about the home, never about the person. */
    label: 'Your question',
    hint: 'The assistant answers from the home’s details. Anything it can’t answer goes to a person.',
    skip: 'Skip',
  },
  /** UX-AV-2: two taps. One screen showing exactly what will be sent. */
  send: {
    title: (operator: string) => `Send this to ${operator}?`,
    lead: 'This is everything they’ll get. Nothing else is sent.',
    you: 'You',
    ask: 'Ask something about the home',
  },
  sendButton: 'Send',
  sending: 'Sending…',
  sendFailed: 'That didn’t send. Check your connection and try again.',
  /** M82: 30 enquiries a day from one person or one network address. */
  limited: {
    title: 'That’s a lot of enquiries for one day',
    text: 'Gaff takes up to 30 a day from one person, to keep it fair for everyone. Nothing more was sent. You can ask about this home tomorrow.',
    action: 'See homes on Gaff',
  },
  gone: {
    title: 'This home isn’t taking enquiries now',
    text: 'It may have been let, or taken off Gaff. Nothing was sent. Homes are added every week.',
    action: 'See homes on Gaff',
  },
  sent: {
    title: 'Sent',
    /** UX-PP-3: the Sent screen says it's an AI assistant, and that a person decides. */
    text: (operator: string) =>
      `${possessive(operator)} AI assistant will reply, and a person there decides who views.`,
    viewings: (date: string) => `Viewings start on ${date}. You’ll hear back either way.`,
    noViewings: 'You’ll hear back either way.',
    /** UX-AV-6: a typed email. */
    checkEmail:
      'Check your email to confirm it’s you. Open the link in it within 24 hours, and your enquiry goes straight to them.',
    /** Signed in: it's in their Enquiries already. */
    inEnquiries: 'It’s in your Enquiries, where you’ll see what happens next.',
    done: 'Done',
  },
} as const;

/**
 * UX-AV-3: what search carried in, in words: "2 people and no pets". Only the four answers, and
 * only those this home asks about.
 */
export function searchedFor(
  answers: { occupants?: number; hasPets?: boolean; moveInDate?: string; stayMonths?: number },
  formatDate: (date: string) => string,
): string | null {
  const parts: string[] = [];
  if (answers.occupants !== undefined) {
    parts.push(answers.occupants === 1 ? '1 person' : `${answers.occupants} people`);
  }
  if (answers.hasPets !== undefined) parts.push(answers.hasPets ? 'a pet' : 'no pets');
  if (answers.moveInDate !== undefined)
    parts.push(`moving in from ${formatDate(answers.moveInDate)}`);
  if (answers.stayMonths !== undefined) {
    parts.push(
      answers.stayMonths < 12
        ? 'a stay of under a year'
        : answers.stayMonths === 12
          ? 'a stay of a year'
          : 'a stay of more than a year',
    );
  }
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}
