import type { SignInMethod } from '@/domain/auth/methods';
import type { RenterView } from '@/domain/renter/path';
import type { TenantTask } from '@/domain/tenancy/tenant-steps';

/**
 * The words a renter sees on Enquiries and Profile, and wherever their profile shows on a home's
 * page (UX-RH-1 to UX-RH-6, UX-PF-1 to UX-PF-7). Plain, warm Irish English; short sentences; each
 * screen ends with what happens next. No disclaimers: the one line of caution here is what stays
 * when a profile is deleted, because that stops a real mistake (Q46).
 */

/** What an Enquiries row needs to say where the renter stands. Dates are already in words. */
export interface EnquiryFacts {
  view: RenterView;
  operator: string;
  /** "Friday 20 November, 6:15pm": their viewing, or the place on offer. */
  viewing: string | null;
  place: string | null;
  /** "Sunday 22 November, 6pm" */
  offerDeadline: string | null;
  /** At the checks: there is one they can do now. */
  checkToDo: boolean;
  tenantTask: TenantTask | null;
  /** "Tuesday 1 December" */
  tenancyStart: string | null;
  /** When their details on this home are deleted: "Friday 18 December". */
  deleteBy: string | null;
}

const tenantLines: Record<TenantTask, (facts: EnquiryFacts) => string> = {
  agreement_coming: (f) => `${f.operator} is preparing your tenancy agreement`,
  sign: () => 'Sign your tenancy agreement',
  agreement_countersign: (f) => `You’ve signed. ${f.operator} signs next`,
  payment_coming: (f) => `${f.operator} will send how to pay`,
  pay: () => 'Pay the deposit and first month’s rent',
  pps: () => 'One question about your PPS number',
  inventory: () => 'Confirm the inventory',
  moving_in: (f) => (f.tenancyStart ? `Your tenancy starts on ${f.tenancyStart}` : 'All done'),
  moved_in: () => 'You’ve moved in',
};

/**
 * UX-RH-1: one line saying where they stand and what's next: "Book a viewing", "On the waiting
 * list", "An offer: answer by Sunday 6pm". The same facts the home's own page is written from.
 */
export function enquiryLine(facts: EnquiryFacts): string {
  const deleted = facts.deleteBy ? ` Your details are deleted by ${facts.deleteBy}.` : '';
  switch (facts.view) {
    case 'questions':
      return 'Answer a few questions';
    case 'answers_sent':
      return `Answers sent. ${facts.operator} decides who views`;
    case 'invited':
      return 'Book a viewing';
    case 'no_times':
      return 'Invited to view. No times are left to book';
    case 'cancelled':
      return 'Viewing cancelled. Book another time';
    case 'booked':
      return facts.viewing ? `Viewing booked: ${facts.viewing}` : 'Viewing booked';
    case 'waiting_list':
    case 'hold_ran_out':
      return 'On the waiting list';
    case 'place_offered':
      return facts.place ? `A place has opened up: ${facts.place}` : 'A place has opened up';
    case 'not_invited_yet':
      return 'Not invited to view yet';
    case 'after_viewing':
      return 'Apply for this home';
    case 'missed_viewing':
      return 'You missed the viewing';
    case 'applied':
      return `Application in. ${facts.operator} is choosing`;
    case 'checks':
      return facts.checkToDo ? 'A few checks to do' : `Checks done. Waiting for ${facts.operator}`;
    case 'offer':
      return facts.offerDeadline ? `An offer: answer by ${facts.offerDeadline}` : 'An offer';
    case 'offer_closed':
      return `The offer has ended.${deleted}`;
    case 'offer_declined':
      return `You declined the offer.${deleted}`;
    case 'tenancy':
      return facts.tenantTask ? tenantLines[facts.tenantTask](facts) : 'Your tenancy';
    case 'let_to_someone_else':
      return `Let to someone else.${deleted}`;
    case 'home_closed':
      return `No longer available.${deleted}`;
    case 'withdrawn':
      return `Enquiry closed.${deleted}`;
  }
}

export const enquiriesCopy = {
  title: 'Enquiries',
  empty: 'Homes you ask to view appear here.',
  emptyText: 'Each one shows where you stand and the one thing to do next.',
  emptyAction: 'Search homes',
  list: 'Homes you’ve asked about',
  /** UX-RH-1: what happens next, under the list. */
  next: 'We email you when anything changes, and each home’s page shows what’s next.',
  /** The words beside the dot on a row that is waiting on them. */
  needsYou: 'Needs you',
  /** Opening a row whose details have since been deleted. */
  gone: {
    title: 'That home’s page has closed',
    text: 'Your details on it have been deleted, so there’s nothing left to open.',
    action: 'Back to Enquiries',
  },
} as const;

const methodWords: Record<SignInMethod, string> = {
  email_code: 'A code by email',
  google: 'Google',
  apple: 'Apple',
  passkey: 'Passkey',
};

export const profileCopy = {
  title: 'Profile',
  lead: 'What Gaff keeps so you don’t type it twice. Only you can see it.',
  change: 'Change',
  add: 'Add',
  remove: 'Remove',
  save: 'Save',
  saving: 'Saving…',
  cancel: 'Cancel',
  notKept: 'Nothing kept',
  failed: 'That didn’t save. Check your connection and try again.',
  details: {
    title: 'Your details',
    name: 'Name',
    nameMissing: 'Not given yet',
    email: 'Email',
    mobile: 'Mobile',
    nameSheet: 'Your name',
    nameLabel: 'First and last name',
    mobileSheet: 'Your mobile number',
    mobileLabel: 'Mobile number',
    mobileHint: 'Offered when you book a viewing, for a text reminder.',
  },
  answers: {
    title: 'Your answers',
    lead: 'Offered when you next ask to view a home.',
    sheet: 'Your answers',
    sheetLead: 'Leave any of them blank to keep nothing for it.',
    people: 'People',
    peopleLabel: 'How many people would live there, including you?',
    pets: 'Pets',
    petsLabel: 'Do you have any pets?',
    petsHint: 'Assistance dogs don’t count as pets.',
    moveIn: 'Move in',
    moveInLabel: 'When could you move in by?',
    moveInTitle: 'Move in by',
    stay: 'Stay',
    stayLabel: 'How long would you like to stay?',
    blank: 'Leave blank',
    yes: 'Yes',
    no: 'No',
    justMe: 'Just me',
    peopleCount: (people: number) => `${people} people`,
    by: (date: string) => `By ${date}`,
  },
  income: {
    title: 'Work and income',
    lead: 'Offered when you next apply for a home.',
    sheet: 'Work and income',
    earning: 'How you earn',
    income: 'Take-home income',
    aMonth: (amount: string) => `${amount} a month`,
    saidOn: (date: string) => `You said so on ${date}`,
  },
  /**
   * UX-PF-8 to UX-PF-11 (Q35): a verified identity, shown only when one is kept. Nobody is ever
   * invited here to verify (UX-PF-13): there's no row until a step needed the check.
   */
  identity: {
    title: 'ID check',
    lead: 'Used again only when you say yes, each time a home’s checks ask for ID.',
    label: 'Name on your ID',
    value: (name: string, date: string) => `${name}, checked on ${date}`,
    keeps: 'Gaff keeps only that it passed, your name and the date.',
    nameChanged: 'My name has changed',
    opening: 'Opening…',
    notPassed: 'That didn’t work this time. The ID check you kept is as it was. You can try again.',
    problems: {
      no_provider: 'The ID check can’t be started here yet.',
      no_attempts_left:
        'You’ve used your three tries at the ID check. The one you kept is as it was. Reply to any email from Gaff to talk to a person.',
    } as Record<string, string>,
  },
  /** UX-PF-1: someone signed in who has never kept anything. */
  nothingYet:
    'Nothing kept yet. When you apply for a home, what you enter is kept here for next time.',
  keeping: {
    title: 'Keeping',
    label: 'Keep what I enter for next time',
    hint: 'Your answers and income from each home you ask about are kept here, for you to confirm next time.',
    on: 'Kept from now on.',
    off: 'Nothing new will be kept.',
  },
  signIn: {
    title: 'Sign-in',
    methods: 'How you sign in',
    passkeysLabel: 'Passkeys',
    passkeys: (count: number) => (count === 1 ? '1 passkey' : `${count} passkeys`),
    method: (method: SignInMethod) => methodWords[method],
    codeByEmail: methodWords.email_code,
  },
  data: {
    title: 'Your data',
    download: 'Download my details',
    downloadHint: 'Everything Gaff keeps on your profile, as one file.',
    delete: 'Delete my profile',
    deleteHint: 'Gone straight away. You can start a new one any time.',
  },
  deleteSheet: {
    title: 'Delete your profile?',
    /** UX-PF-6: what goes. */
    text: 'Everything on this page is deleted straight away, and your list of enquiries with it.',
    textKeepsSignIn:
      'Everything you keep as a renter is deleted straight away, and your list of enquiries with it. Your sign-in stays, because you let homes on Gaff.',
    /** UX-PF-6: the one line that says what stays. */
    stays: 'Homes you’ve applied for keep your application until that letting ends.',
    confirm: 'Delete my profile',
    deleting: 'Deleting…',
  },
  deleted: {
    title: 'Your profile is deleted',
    text: 'Homes you’ve applied for keep your application until that letting ends. Their emails still reach you, and the links in them still work.',
    signedOut: 'You’re signed out. You can sign in again any time to start afresh.',
    keepsSignIn: 'Your sign-in is still here for the homes you let.',
    action: 'Search homes',
    actionLetting: 'Go to Today',
  },
  toasts: {
    saved: 'Saved',
    removed: 'Removed',
  },
  /** What happens next, at the foot of Profile. */
  next: 'What you keep here is offered back the next time you ask to view or apply, for you to check.',
} as const;

/** UX-RN-13, UX-PF-2, UX-PF-3, UX-PF-5: the profile's words on a home's own pages. */
export const keepCopy = {
  /** UX-RN-13: the one tick on the application's check screen, off by default. */
  tick: 'Keep my details for next time',
  tickHint: 'We’ll email you a code to set it up.',
  legend: 'Next time',
  /** UX-PF-2: said once on the check screen to someone whose profile keeps what they enter. */
  kept: 'These are kept on your profile for next time.',
  /** UX-PF-3, UX-PF-5: kept details, offered back. */
  stillRight: 'Is this still right?',
  fromProfile: 'From your profile. Change anything that’s different now.',
  saidOn: (date: string) => `You said so on ${date}`,
  /** After the code: back on the home's page. */
  done: 'Your details are kept for next time.',
  enquiries: 'See all your enquiries',
  /** After the code, when the details were kept: what happens next. */
  doneNext: 'Next time you apply for a home, they’re offered back for you to check.',
  /** The code couldn't be sent, or the address isn't the one on the application. */
  notKept: 'We couldn’t keep your details this time. Your application is in.',
} as const;

/** "Download my details": the file's own words. Keys are plain, so a person can read it. */
export const downloadCopy = {
  fileName: 'gaff-my-details.json',
  about:
    'Everything Gaff keeps on your profile. Each home you applied for keeps its own copy of your application until that letting ends; ask whoever lets it for that.',
} as const;
