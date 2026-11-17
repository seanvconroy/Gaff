import { formatDate } from '@/lib/format';

/**
 * The words of a letting's page (section 4 of the UX redesign, "A letting's page", UX-LP-1 to
 * UX-LP-13): its three views, the three blocks of Overview at each stage, People and Home. The
 * person running the letting reads these. Plain, warm Irish English; every block ends with what
 * happens next. Nothing here recommends a person: beside a name is only what was asked (Q36).
 */

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const lettingPageCopy = {
  views: { label: 'This letting', overview: 'Overview', people: 'People', home: 'Home' },
  progress: 'How far it’s got',

  /** The one status line under the address. */
  status: {
    draft: 'Not live yet',
    live: 'Live',
    let: 'Let',
    withdrawn: 'Withdrawn',
  } as Record<string, string>,

  needsYou: {
    heading: 'Needs you',
    nothing: 'Nothing needs you',
    also: 'Also waiting',
    /** What Gaff is doing while nothing needs a person, by stage. */
    doing: {
      setup: 'Gaff answers enquiries as soon as it’s live.',
      enquiries: 'Gaff is answering enquiries.',
      viewings: 'Gaff is booking viewings and sending the reminders.',
      applications: 'Gaff is inviting the people who came to apply.',
      checks: 'Gaff is running the checks.',
      offer: 'Gaff is waiting for an answer.',
      tenancy: 'Gaff is waiting on the tenant.',
      closed: 'This letting is closed. There’s nothing more to do.',
    },
    held: 'Gaff is waiting to confirm your agency.',
    setup: (left: number) =>
      left === 0
        ? 'Finish setting up. It’s ready to take enquiries.'
        : `Finish setting up. ${count(left, 'step', 'steps')} left.`,
    continue: 'Continue',
    rent: {
      lead: 'The rent is above what the rent rules allow. Change it before anyone is offered the home.',
      action: 'Check the rent again',
    },
    failed: {
      lead: (n: number) =>
        n === 1
          ? 'A message to a renter didn’t send. Check their email address and send it again.'
          : `${n} messages to renters didn’t send. Check their email addresses and send them again.`,
      action: (n: number) => (n === 1 ? 'Open the conversation' : 'Open Inbox'),
    },
    licence: 'Find our licence',
    waitingOn: (first: string) =>
      `${first} is reading the agreement. Gaff tells you when it’s signed.`,
  },

  /** The verb on the page's one button, for each of Today's kinds of task. */
  actions: {
    attendance: 'Mark who came',
    shortlist: 'Choose who views',
    choose: 'Choose an applicant',
    rechoose: 'Choose again',
    checks: 'Review the checks',
    offer: 'Make the offer',
    rtb: 'Register with the RTB',
    approvals: (n: number) => (n === 1 ? 'Approve the answer' : 'Approve the answers'),
    questions: (n: number) => (n === 1 ? 'Answer the question' : 'Answer the questions'),
    attention: 'Open Inbox',
    forwarding: 'Set up forwarding',
  },

  happening: {
    heading: 'What’s happening',
    nothing: 'Nothing yet.',
    recent: 'Lately',
    seeEverything: 'See everything',
    figures: {
      enquiries: 'Enquiries',
      answered: 'Answered the questions',
      meetEverything: 'Meet everything you asked',
      booked: 'Places booked',
      waitlist: 'On the waiting list',
      nextViewing: 'Next viewing',
      noViewing: 'None to come',
      came: 'Came to view',
      applied: 'Applied',
      checks: (first: string) => `${first}’s checks`,
      checksDone: (done: number, total: number) => `${done} of ${total} back`,
      owner: 'Owner’s answer',
      ownerState: {
        not_asked: 'Not asked yet',
        waiting: 'Waiting',
        approved: 'Approved',
        declined: 'Declined',
      } as Record<string, string>,
      offer: 'Offer',
      offerState: (state: string) => {
        if (state === 'open') return 'Sent';
        if (state === 'accepted') return 'Accepted';
        if (state === 'not_accepted') return 'Not accepted';
        return 'Not sent yet';
      },
      steps: 'Steps done',
      of: (done: number, total: number) => `${done} of ${total}`,
      startDate: 'Starts',
      daysToLet: 'Days to let',
      timeSaved: 'Time saved',
      notCounted: 'Not counted',
    },
    tenancyLink: 'The tenancy, step by step',
  },

  next: {
    heading: 'What’s next',
    setup: 'When it’s live, Gaff answers every enquiry within minutes.',
    enquiries: 'Next, you choose who views. Do it whenever you’re ready.',
    shortlist: 'Gaff invites the people you choose and tells everyone else where they stand.',
    viewings: 'After each viewing, Gaff invites the people who came to apply.',
    applications: 'Gaff checks only the person you choose and one backup.',
    checks: 'When the checks are back, you make the offer.',
    offer: (first: string | null) =>
      first
        ? `When ${first} accepts, Gaff tells everyone else and prepares the tenancy.`
        : 'When the offer is accepted, Gaff tells everyone else and prepares the tenancy.',
    tenancy: (step: string | null) =>
      step ? `After that: ${step}.` : 'When every step is done, you finish the letting.',
    finish: 'When you finish, Gaff shows how long it took and the time it saved you.',
    deletes: (date: string, others: boolean) =>
      others
        ? `Gaff deletes other applicants’ details on ${formatDate(date)}.`
        : `Gaff deletes renters’ details on ${formatDate(date)}.`,
    deleted:
      'Renters’ details have been deleted. The record stays, with no personal details in it.',
  },

  people: {
    heading: 'People',
    filter: 'Show',
    chips: {
      all: 'All',
      answered: 'Answered',
      not_yet: 'Not yet',
      invited: 'Invited',
      waitlist: 'Waiting list',
      applied: 'Applied',
      chosen: 'Chosen',
      others: 'Others',
    } as Record<string, string>,
    caption: 'Everyone who enquired',
    head: ['Name', 'Where they stand', 'Status'],
    none: {
      title: 'Nobody has enquired yet',
      live: 'Everyone who enquires appears here, in the order Gaff ranks them. Gaff replies to each one for you.',
      draft: 'Enquiries that arrive now are kept safe. Gaff answers them as soon as it’s live.',
    },
    noneHere: 'Nobody here just now. Choose All to see everyone.',
    order:
      'In the order Gaff ranks them: by how many of your criteria they meet, then by when they enquired.',
    sheet: {
      told: 'What they’ve told Gaff',
      happened: 'What’s happened',
      conversation: 'Open the conversation',
      deleted: 'Their details have been deleted.',
      via: 'Enquired through',
      email: 'Email',
      phone: 'Phone',
      fit: 'What you asked',
      income: 'Income',
      earning: 'How they earn',
      checks: 'Checks',
      notAnswered: 'They haven’t answered the questions yet. Gaff has asked them.',
    },
  },

  home: {
    heading: 'The home as renters see it',
    change: 'Change',
    photos: 'Photos',
    noPhotos: 'No photos yet.',
    description: 'Description',
    noDescription: 'No description yet.',
    facts: 'Facts',
    factsUsed: 'Gaff answers renters from these, as they are now.',
    details: 'Letting details',
    noDetails: 'Nothing asked. Everyone is ranked by when they enquired.',
    notSet: 'Not set yet.',
    viewings: 'Viewing times',
    noViewings: 'No viewing times yet.',
    rentCheck: 'Rent check',
    checkAgain: 'Check again',
    comparables: 'Comparable rents',
    noComparables: 'None yet. The offer needs three.',
    advertised: 'Where it’s advertised',
    onGaff: 'Gaff',
    notAdvertised: 'Not advertised anywhere else.',
    notAsked: 'Not answered yet.',
    owner: 'The owner',
    noOwner: 'Not added yet.',
    shareWithOwner: 'Share with the owner',
    rent: 'Rent',
    available: 'Available from',
  },

  history: {
    metaTitle: 'History',
    title: 'History',
    lead: 'Every message, booking and decision, newest first. It can’t be edited, so you can stand over it if you’re ever asked.',
    filter: 'Show',
    all: 'Everything',
    decisions: 'Decisions only',
    none: 'Nothing has happened yet.',
    noDecisions: 'No decisions yet. Every choice you make about people is recorded here.',
  },

  close: {
    metaTitle: 'Close this letting',
    title: 'How did it end?',
    lead: 'Gaff tells everyone who enquired, cancels any viewings still to come, and deletes renters’ details on schedule.',
    let: 'It’s let',
    withdrawn: 'We’re not letting it now',
    choose: 'Choose whether the home is let or withdrawn.',
    button: 'Close the letting',
    closing: 'Closing…',
  },

  menu: {
    seeOnGaff: 'See it on Gaff',
    change: 'Change the home’s details',
    shareWithColleague: 'Share with a colleague',
    history: 'History',
    close: 'Close this letting',
  },
} as const;
