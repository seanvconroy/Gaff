/**
 * UX-PP-7, UX-RN-1: one link per renter per home, and the page it opens always shows where they
 * stand now. This is the one rule that says which page that is, from what Gaff holds about their
 * enquiry. It reads statuses, counts and yes/no facts only: never an answer, a name or anything
 * about the person. It never ends anyone's path on what they answered (UX-RN-4, rule 1): the
 * only things that move a renter on are a person's decisions and their own actions.
 */

export type RenterStatus =
  | 'enquired'
  | 'invited'
  | 'waitlisted'
  | 'not_invited'
  | 'booked'
  | 'attended'
  | 'no_show'
  | 'withdrawn'
  | 'applied'
  | 'preferred'
  | 'backup'
  | 'offered'
  | 'accepted'
  | 'declined'
  | 'not_chosen';

export interface RenterSituation {
  status: RenterStatus;
  lettingStatus: 'draft' | 'live' | 'let' | 'withdrawn';
  /** How many pre-viewing questions this home asks (UX-RN-2). */
  questions: number;
  /** They have sent their answers. */
  answered: boolean;
  /** They hold a viewing now. */
  hasBooking: boolean;
  /** A viewing they held was cancelled, and they hold none now. */
  bookingCancelled: boolean;
  /** How many viewing times they could book now. */
  timesToBook: number;
  /** A place from the waiting list is on offer to them now (UX-RN-6). */
  placeOffered: boolean;
  /** A place that was held for them went to the next person (UX-RN-10, States). */
  holdRanOut: boolean;
  /** Their offer of the home: open, or how it ended. Null if there has been none. */
  offer: 'open' | 'accepted' | 'declined' | 'expired' | 'withdrawn' | null;
}

/** Each page in the renter's path table (section 5, "The renter's path"), and its states. */
export type RenterView =
  | 'questions'
  | 'answers_sent'
  | 'invited'
  | 'no_times'
  | 'cancelled'
  | 'booked'
  | 'waiting_list'
  | 'place_offered'
  | 'hold_ran_out'
  | 'not_invited_yet'
  | 'after_viewing'
  | 'missed_viewing'
  | 'applied'
  | 'checks'
  | 'offer'
  | 'offer_closed'
  | 'offer_declined'
  | 'tenancy'
  | 'let_to_someone_else'
  | 'home_closed'
  | 'withdrawn';

/** Statuses that outlive the letting: the tenant, and people told how their offer ended. */
const SETTLED: readonly RenterStatus[] = ['accepted', 'declined', 'not_chosen'];

export function renterView(s: RenterSituation): RenterView {
  const closed = s.lettingStatus === 'let' || s.lettingStatus === 'withdrawn';
  if (closed && !SETTLED.includes(s.status)) {
    return s.lettingStatus === 'let' ? 'let_to_someone_else' : 'home_closed';
  }
  switch (s.status) {
    case 'enquired':
      return s.questions > 0 && !s.answered ? 'questions' : 'answers_sent';
    case 'invited':
      if (s.hasBooking) return 'booked';
      if (s.bookingCancelled) return 'cancelled';
      return s.timesToBook > 0 ? 'invited' : 'no_times';
    case 'booked':
      return s.hasBooking ? 'booked' : s.bookingCancelled ? 'cancelled' : 'invited';
    case 'waitlisted':
      if (s.placeOffered) return 'place_offered';
      return s.holdRanOut ? 'hold_ran_out' : 'waiting_list';
    case 'not_invited':
      return 'not_invited_yet';
    case 'attended':
      return 'after_viewing';
    case 'no_show':
      return 'missed_viewing';
    case 'applied':
      return 'applied';
    case 'preferred':
    case 'backup':
      return 'checks';
    case 'offered':
      return s.offer === 'open' ? 'offer' : 'offer_closed';
    case 'accepted':
      return 'tenancy';
    case 'declined':
      return s.offer === 'expired' || s.offer === 'withdrawn' ? 'offer_closed' : 'offer_declined';
    case 'not_chosen':
      return 'let_to_someone_else';
    case 'withdrawn':
      return 'withdrawn';
  }
}

/**
 * UX-RN-1 (rule 2, staged data): what each page may collect. A page never asks for anything
 * that isn't in its row, and no page before `checks` asks for a document.
 */
export const collectedAt: Record<RenterView, readonly string[]> = {
  questions: ['criteria answers'],
  answers_sent: [],
  invited: ['booking time', 'mobile number (optional)'],
  no_times: [],
  cancelled: ['booking time', 'mobile number (optional)'],
  booked: [],
  waiting_list: [],
  place_offered: ['booking time', 'mobile number (optional)'],
  hold_ran_out: [],
  not_invited_yet: [],
  after_viewing: ['how they mainly earn', 'household take-home income'],
  missed_viewing: [],
  applied: [],
  checks: ['identity check', 'income check', 'referees'],
  offer: ['answer to the offer'],
  offer_closed: [],
  offer_declined: [],
  tenancy: ['signature', 'PPS number (optional)'],
  let_to_someone_else: [],
  home_closed: [],
  withdrawn: [],
};

/**
 * UX-SI-12, UX-RN-14 (ADR-0013): a private link is enough to answer questions and book a
 * viewing. The pages that show check results or bank details, or change where Gaff writes to
 * someone, also ask for a one-time code sent to the email on the application, unless the person
 * is signed in with that same email.
 */
export type GuardedStep = 'checks' | 'pay' | 'change_email';

export function needsCode(input: {
  /** This browser entered the code for this link a short while ago. */
  hasPass: boolean;
  /** The signed-in person's email, if anyone is signed in. */
  signedInEmail: string | null;
  /** The email on the application. */
  applicationEmail: string;
}): boolean {
  if (input.hasPass) return false;
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  return !(input.signedInEmail !== null && same(input.signedInEmail, input.applicationEmail));
}
