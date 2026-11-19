import { CODE_LASTS_MINUTES } from '@/domain/auth/codes';

/**
 * Every word on a renter's or a tenant's own page (section 5 of the UX redesign, "Inside a
 * letting"; UX-RN-1 to UX-RN-26). Plain, warm Irish English: short sentences, no jargon, no
 * exclamation marks, no blame. Every page ends with what happens next, and when.
 *
 * THE FOUR NOTICES (UX-PP-6, Q46). A line of caution appears only where the law needs it at that
 * moment or it stops a real mistake. On a renter's whole path there are four, and they are the
 * `notices` below: what a check keeps, before it starts; "No other fees" on the offer; "Ring to
 * check these details" on the payment page; and when their details will be deleted, on a closed
 * home. Nothing else on these pages hedges, reassures or disclaims. A journey holds the pages to
 * that (tests/e2e/ux-rn-renter-pages.spec.ts).
 *
 * Emails and texts are not here: they are fixed templates (src/copy/templates), and their words
 * don't change.
 */

/** The four lines of caution a renter ever sees (UX-PP-6). Each page marks its own. */
export const notices = {
  /** 1. What a check keeps, before it starts (UX-RN-16). */
  check: {
    identity: (operator: string, days: number) =>
      `Gaff keeps only the result and the name on your ID, never the photos. Only ${operator} sees it, and it’s deleted ${days} days after the letting closes.`,
    income: (operator: string, days: number) =>
      `Gaff keeps only the monthly amount, never your statements. Only ${operator} sees it, and it’s deleted ${days} days after the letting closes.`,
    references: (operator: string) =>
      `Your referees’ answers go only to ${operator}, and are deleted once the tenancy starts or the letting closes.`,
  },
  /** 2. On the offer (UX-RN-19; rules 4 and 5). */
  noOtherFees: (operator: string) => `No other fees. You pay ${operator} directly.`,
  /** 3. On the payment page (UX-RN-23; rule 5). */
  ringToCheck: {
    title: 'Ring to check these details',
    withNumber: (operator: string, number: string) =>
      `Before you pay, ring ${operator} on ${number} and check the IBAN with them.`,
    /** The lister has no number on file yet: the tenant uses one they already have. */
    withoutNumber: (operator: string) =>
      `Before you pay, ring ${operator} on a number you already have for them, and check the IBAN with them.`,
    button: (number: string) => `Ring ${number}`,
  },
  /** 4. On a closed home (rule 9). */
  deletedBy: (date: string) => `We’ll delete your details from Gaff by ${date}.`,
} as const;

export const common = {
  next: 'Next',
  back: 'Back',
  change: 'Change',
  done: 'Done',
  yes: 'Yes',
  no: 'No',
  thanks: (firstName: string) => (firstName ? `Thanks, ${firstName}` : 'Thanks'),
  /** States: a send failed. Shown at the button; what was entered is kept. */
  sendFailed: 'That didn’t send. Check your connection and try again.',
  linkEnded: 'This link has ended. Reply to any email from us and we’ll help.',
} as const;

/** States: loading. The frame is there at once; this is what a screen reader hears meanwhile. */
export const loadingCopy = { label: 'Opening your page' } as const;

/** States: a page couldn’t load, or a button’s action never arrived. One sentence and a way on. */
export const failedCopy = {
  title: 'That didn’t work',
  text: 'We couldn’t reach Gaff. Check your connection and try again.',
  button: 'Try again',
} as const;

/** States: the link has expired or been withdrawn. */
export const linkEnded = {
  title: 'This link has ended',
  text: 'It may have run out, or the home may have been let. To reach whoever is letting it, reply to any email from us.',
} as const;

/** UX-RN-2 to UX-RN-4: the pre-viewing questions, one per screen. */
export const questionsCopy = {
  progress: 'A few quick questions',
  lead: (firstName: string, operator: string) =>
    `${firstName ? `Hi ${firstName}. ` : ''}${operator} asks everyone the same questions.`,
  names: { occupants: 'People', hasPets: 'Pets', moveInDate: 'Moving in', stayMonths: 'Staying' },
  occupants: {
    title: 'How many people would live here, including you?',
    more: '6 or more',
    moreLabel: 'How many people?',
  },
  hasPets: {
    title: 'Do you have any pets?',
    hint: 'Assistance dogs don’t count as pets.',
  },
  moveInDate: {
    title: (date: string) => `Could you move in by ${date}?`,
    later: 'No, I’d need later',
    dateLabel: 'When could you move in?',
    dateTitle: 'When could you move in?',
  },
  stayMonths: { title: 'How long would you like to stay?' },
  send: 'Send my answers',
  sending: 'Sending…',
  next: (operator: string, firstViewing: string | null) =>
    `A person at ${operator} decides who views. ${
      firstViewing ? `Viewings start on ${firstViewing}, and you’ll` : 'You’ll'
    } hear from us either way.`,
} as const;

/** Answers sent: "Thanks", and what happens next. Whatever was answered (UX-RN-4). */
export const answersSentCopy = {
  text: (operator: string) => `Your answers are with ${operator}.`,
  nothingAsked: (operator: string) => `Your enquiry is with ${operator}.`,
  yourAnswers: 'Your answers',
  change: 'Change my answers',
  next: (operator: string, firstViewing: string | null) =>
    `A person at ${operator} decides who views. ${
      firstViewing ? `Viewings start on ${firstViewing}. ` : ''
    }If you’re invited, we’ll email you a link to book a time. You’ll hear from us either way.`,
} as const;

/** UX-RN-5 to UX-RN-10: viewings. */
export const viewingCopy = {
  invited: {
    title: 'You’re invited to view',
    text: 'Choose a time that suits you.',
    button: 'Choose a time',
    next: 'We’ll email you to confirm it straight away, and remind you the day before.',
  },
  noTimes: {
    title: 'The viewing times are all taken',
    text: (operator: string) =>
      `Reply to any email from us and ${operator} will see what they can do.`,
    next: 'If a time opens up, it will show here. You’ll hear from us either way.',
  },
  choose: {
    title: 'Choose a time',
    changeTitle: 'Change your viewing',
    changeLead: (current: string) => `You’re booked for ${current}. Choose a new time.`,
    days: 'Days with a place',
    justGone: 'That time has just gone. Here are the others.',
    keep: 'Keep the time I have',
    next: 'You’ll confirm it on the next screen.',
  },
  confirm: {
    title: 'Book this viewing?',
    changeTitle: 'Move to this time?',
    mobileLabel: 'Mobile number for a text reminder',
    mobileHint: 'We’ll text you two hours before.',
    mobileGiven: 'Text reminder to',
    button: 'Book this viewing',
    moveButton: 'Move my viewing',
    booking: 'Booking…',
    another: 'Choose another time',
    next: 'We’ll email you to confirm it straight away, and remind you the day before.',
    moveNext: 'Your old time goes to someone else, and we’ll email you the new one.',
    problems: {
      phone: 'That mobile number doesn’t look right. Check it, or leave it blank.',
      too_late: 'That time is about to start, so it can’t be booked now. Choose another.',
      not_invited: 'This viewing can’t be booked from this link.',
    },
  },
  booked: {
    title: 'You’re booked',
    calendar: 'Add to my calendar',
    directions: 'Get directions',
    change: 'Change the time',
    cancel: 'Cancel',
    next: (texts: boolean) =>
      texts
        ? 'We’ll remind you the day before, and text you two hours before.'
        : 'We’ll remind you the day before.',
  },
  cancel: {
    title: 'Cancel your viewing?',
    next: 'If you cancel, your place goes to someone else straight away.',
    button: 'Cancel my viewing',
    cancelling: 'Cancelling…',
    keep: 'Keep my viewing',
  },
  cancelled: {
    title: 'Your viewing is cancelled',
    text: 'Thanks for letting us know.',
    button: 'Book another time',
    next: 'You can book another time while there are places. You’ll hear from us either way.',
  },
  waitingList: {
    title: 'You’re on the waiting list',
    text: 'If someone cancels, their place is offered to the next person on the list.',
    next: 'If a place opens for you, we’ll email you straight away. You’ll hear from us either way.',
  },
  place: {
    title: 'A place has opened up',
    held: (until: string) => `It’s yours ${until}.`,
    open: 'It’s been offered to everyone on the waiting list, so the first to take it gets it.',
    button: 'Take this place',
    taking: 'Booking…',
    next: 'After that, it goes to the next person on the waiting list.',
    openNext: 'We’ll email you to confirm it straight away.',
  },
  holdRanOut: {
    title: 'That place has gone to the next person',
    text: 'You’re still on the waiting list.',
  },
  notInvitedYet: {
    title: (operator: string) => `${operator} has had a lot of interest`,
    text: 'They haven’t been able to invite everyone to view.',
    next: (lastViewing: string | null) =>
      lastViewing
        ? `Viewings finish on ${lastViewing}. You’ll hear from us either way after that.`
        : 'You’ll hear from us either way once the home is let.',
  },
  missed: {
    title: 'Your viewing time has passed',
    text: (operator: string) =>
      `If you’d still like to see the home, reply to any email from us and ${operator} will see what they can do.`,
    next: 'You’ll hear from us either way once the home is let.',
  },
} as const;

/** UX-RN-11 to UX-RN-13: applying. */
export const applyCopy = {
  invite: {
    title: 'Thanks for coming. Would you like to apply?',
    text: 'Two questions. It takes a minute, and you don’t need any documents.',
    button: 'Apply',
    next: (operator: string) =>
      `${operator} chooses who to offer the home to after the viewings. We’ll email you either way.`,
  },
  progress: 'Your application',
  names: { earning: 'Earning', income: 'Income', check: 'Check' },
  earning: { title: 'How do you earn most of your income?' },
  income: {
    title: 'What’s your household’s take-home income each month?',
    label: 'Take-home income each month',
    /** UX-RN-12: two lines of help, and one for the agency's rule. Nothing asks about HAP. */
    help: 'After tax, for everyone who’d pay the rent. Include any housing support, such as HAP.',
    rule: (operator: string, times: string) =>
      `${operator} looks for ${times} times the rent. Everyone is asked the same.`,
  },
  check: {
    title: 'Is this right?',
    name: 'Name',
    email: 'Email',
    earning: 'How you earn',
    income: 'Take-home income',
    aMonth: (amount: string) => `€${amount} a month`,
  },
  name: { title: 'What’s your name?', label: 'First and last name', done: 'Done' },
  email: {
    title: 'Which email should we use?',
    label: 'Email',
    hint: 'We’ll email a code to the address we have now, to check it’s you.',
  },
  send: 'Send my application',
  sending: 'Sending…',
  next: (operator: string) =>
    `Only ${operator} sees this. They choose who to offer the home to after the viewings, and we’ll email you either way.`,
  applied: {
    title: 'Your application is in',
    text: (operator: string) => `It’s with ${operator}.`,
    change: 'Change my application',
    next: (operator: string) =>
      `${operator} chooses who to offer the home to after the viewings. We’ll email you either way.`,
  },
  problems: {
    name: 'Enter your first and last name.',
    email: 'Enter an email address, like name@example.ie.',
    emailTaken: 'That email is already used for this home. Use another, or keep the one you have.',
  },
} as const;

/** UX-RN-14, UX-SI-12: the one-time code before check results or bank details. */
export const codeGateCopy = {
  title: 'First, check it’s you',
  ask: (sentTo: string) => `We’ll email a six-digit code to ${sentTo}.`,
  button: 'Email me a code',
  sending: 'Sending your code…',
  sent: (sentTo: string) =>
    `We sent a six-digit code to ${sentTo}. It works for the next ${CODE_LASTS_MINUTES} minutes.`,
  label: 'Six-digit code',
  checking: 'Checking…',
  wrong: 'That code isn’t right. Check the email and try again.',
  expired: 'That code has expired.',
  sendNew: 'Send a new code',
  sentNew: 'We’ve sent a new code. The old one no longer works.',
  wait: 'We’ve just sent you a code. Check your email.',
  tooMany: 'We’ve sent a few codes to that address. Wait 10 minutes, then try again.',
  notSent: 'We couldn’t send the code. Try again in a moment.',
  thenPay: 'Once you’ve entered it, you’ll see how to pay.',
} as const;

/** UX-RN-14 to UX-RN-18: the checks, one at a time. */
export const checksCopy = {
  title: 'A few checks before an offer',
  more: 'More',
  lead: (operator: string) =>
    `${operator} would like to check a few things before making an offer.`,
  start: 'Start',
  list: 'Your checks',
  names: { identity: 'Your ID', income: 'Your income', references: 'Your references' },
  states: { done: 'Done', next: 'Next', under_way: 'Under way', to_come: 'To come' },
  identity: {
    what: 'You’ll photograph your passport or driving licence and take a selfie. It takes about two minutes.',
    more: 'A secure ID service checks that the photo and the selfie match. Gaff is told only whether they did, and the name on your ID. You can ask for the result to be deleted sooner: talk to a person.',
    button: 'Check my ID',
  },
  /**
   * A verified identity kept on the renter's own profile (Q35): reused only with their yes, each
   * time (UX-PF-12); its name checked against the application's (UX-PF-14); and, after a check
   * passes, the one question about keeping it (UX-PF-8). Nothing here is ever shown before an
   * operator has chosen them (UX-PF-13).
   */
  keptId: {
    useTitle: (date: string) => `Use the ID check you did on ${date}?`,
    useText: (name: string) => `It’s in the name ${name}.`,
    use: 'Yes, use it',
    using: 'Using it…',
    doAgain: 'No, I’ll do it again',
    checkNameTitle: 'Check your name',
    checkNameText: (verified: string, applied: string) =>
      `Your ID check is in the name ${verified}. This application is in the name ${applied}.`,
    checkNameHow:
      'If the name on your ID is right, use it on this application. If your name has changed, do the ID check again.',
    useVerified: 'Use the name on my ID',
    checkAgain: 'Do the ID check again',
    keepTitle: 'Keep this, so you never have to do it again?',
    keepLead: (name: string, date: string) =>
      `Your ID check passed, in the name ${name}, on ${date}.`,
    keepText:
      'Keep it on your Gaff profile, and when another home’s checks ask for ID you can use this one. Gaff keeps only that it passed, your name and the date.',
    keepCode: 'We’ll email you a code to set up your profile.',
    keep: 'Keep it',
    keeping: 'Keeping…',
    notNow: 'Not now',
    keepNext: 'Then you’ll go on to your next check.',
    kept: 'Your ID check is kept on your profile',
    keptNext: 'Next time a home’s checks ask for ID, you can use it.',
    notKept: 'We couldn’t keep your ID check this time. Your check for this home is still done.',
    problems: {
      name: 'The name on your ID check isn’t the name on this application.',
      nothing_kept: 'There’s no ID check kept on your profile now. You can do the check here.',
    } as Record<string, string>,
  },
  income: {
    what: 'You’ll connect your bank, read-only, through a secure open banking service. It confirms your take-home income.',
    more: 'The service reads your income from your account once, and can’t move money or see your login. Gaff is told only the monthly amount. You can ask for it to be deleted sooner: talk to a person.',
    button: 'Check my income',
    payslips: 'I’d rather send payslips',
    payslipsTitle: 'Sending payslips instead',
    payslipsText: (operator: string) =>
      `Reply to any email from us and say you’d rather send payslips. ${operator} will arrange it with you.`,
  },
  references: {
    more: 'We email each referee a short form, and remind them twice if they don’t answer. Nobody else sees what they say.',
    progress: 'Your references',
    names: { rented: 'Renting', landlord: 'Landlord', employer: 'Work', manager: 'Employer' },
    rented: { title: 'Have you rented before?' },
    landlord: {
      title: 'Who was your last landlord?',
      name: 'Their name',
      email: 'Their email',
    },
    employer: { title: 'Is there an employer we can ask?' },
    manager: {
      title: 'Who should we ask?',
      name: 'Your employer’s name, or your manager’s',
      email: 'Their work email',
    },
    send: 'Send',
    sending: 'Sending…',
    problems: {
      rented: 'Choose whether you’ve rented before.',
      employer: 'Choose whether there’s an employer we can ask.',
      name: 'Enter their name.',
      email: 'Enter an email address, like name@example.ie.',
    },
  },
  arranged: (operator: string) => `${operator} will arrange this check with you.`,
  tryAgain: 'Try again',
  startAgain: 'Start again',
  opening: 'Opening…',
  unfinished: 'It looks like this one wasn’t finished. You can start it again.',
  notPassed: {
    title: 'That didn’t work this time',
    reasons: {
      document: 'The check couldn’t confirm your ID document.',
      face_mismatch: 'The check couldn’t match your selfie to your ID.',
      no_regular_income: 'The check couldn’t find a regular income in your account.',
      gave_up: 'The check wasn’t finished.',
    } as Record<string, string>,
    other: 'The check didn’t finish.',
    after: (operator: string) =>
      `You can try again. If you’d rather explain, or add a guarantor, talk to a person at ${operator}.`,
  },
  /** P25: three tries at the ID check, and it didn't pass. Never "danger" (CLAUDE.md, Voice). */
  noTriesLeft: {
    title: 'You’ve used your three tries',
    text: (operator: string) =>
      `The ID check can’t be started again from here. Reply to any email from us and say you’d like to talk to a person. Someone at ${operator} will answer you and help you finish your checks.`,
  },
  referee: {
    landlord: 'Your last landlord',
    employer: 'Your employer',
    asked: (date: string) => `asked on ${date}`,
    answered: 'has answered',
    noAnswer: 'hasn’t answered',
  },
  done: {
    title: 'That’s everything from you',
    text: (operator: string) => `Your checks are with ${operator}.`,
  },
  next: (operator: string) =>
    `When the checks are done, ${operator} decides who to offer the home to. We’ll email you either way.`,
  startNext: 'You can stop after any check and come back to the next one.',
  problems: {
    no_provider: 'That check can’t be started here yet. We’ll be in touch about it.',
    no_attempts_left:
      'You’ve used your three tries at the ID check. Reply to any email from us to talk to a person.',
    done: 'That check is already done.',
    not_chosen: 'Checks aren’t needed from this link.',
    link: common.linkEnded,
  } as Record<string, string>,
} as const;

/** UX-RN-19, UX-RN-20: the offer. */
export const offerCopy = {
  title: (address: string) => `An offer for ${address}`,
  text: (operator: string) => `${operator} would like to offer you the home.`,
  rent: 'Rent',
  from: 'From',
  total: 'To pay before you move in',
  deposit: 'Deposit',
  firstRent: 'First month’s rent',
  deadline: (when: string) => `Answer by ${when}.`,
  accept: 'Accept the offer',
  accepting: 'Accepting…',
  decline: 'Decline',
  next: (operator: string) =>
    `If we don’t hear from you by then, the offer closes. Once you accept, ${operator} prepares your tenancy agreement.`,
  declineStep: {
    title: 'Decline the offer?',
    text: 'If you decline, the home may be offered to someone else. This can’t be undone.',
    button: 'Decline the offer',
    declining: 'Declining…',
    back: 'Back to the offer',
  },
  declined: { title: 'You’ve declined the offer', text: 'Thanks for letting us know.' },
  closed: {
    title: 'This offer has closed',
    text: (operator: string) =>
      `The time to answer has passed. To ask about it, talk to a person at ${operator}.`,
  },
  problems: {
    expired: 'The time to answer has passed, so this offer has closed.',
    not_open: 'This offer has already been answered.',
    link: common.linkEnded,
  } as Record<string, string>,
} as const;

/** UX-RN-21 to UX-RN-26: the tenancy. */
export const tenancyCopy = {
  title: 'Your tenancy',
  lead: (start: string) => `You’ve accepted the offer. Your tenancy starts on ${start}.`,
  list: 'Your tenancy, step by step',
  steps: {
    agreement: 'Sign your agreement',
    payment: 'Pay the deposit and first month’s rent',
    inventory: 'Confirm the inventory',
  },
  states: { done: 'Done', next: 'Next', to_come: 'To come' },
  readAgreement: 'Read your agreement',
  tasks: {
    agreement_coming: {
      text: (operator: string) => `${operator} is preparing your tenancy agreement.`,
      next: 'We’ll email you as soon as it’s ready to sign.',
    },
    sign: {
      text: 'Your tenancy agreement is ready.',
      button: 'Read and sign',
      next: (operator: string) =>
        `Once you’ve signed, ${operator} signs too, and you’ll both have a copy.`,
    },
    agreement_countersign: {
      text: (operator: string) => `You’ve signed. ${operator} signs next.`,
      next: 'We’ll email you your copy. Then they’ll send you how to pay.',
    },
    payment_coming: {
      text: (operator: string) =>
        `Next, ${operator} will send you how to pay the deposit and first month’s rent.`,
      next: 'We’ll email you when the details are here.',
    },
    pay: {
      text: (total: string, by: string | null) => `${total} to pay${by ? ` by ${by}` : ''}.`,
      button: 'See how to pay',
      next: (operator: string) =>
        `Once the money arrives, ${operator} confirms it here, and we’ll email you a receipt.`,
    },
    inventory: {
      text: 'Your move-in inventory is ready to check.',
      button: 'Check the inventory',
      next: (operator: string) => `${operator} is told as soon as you confirm it.`,
    },
    moving_in: {
      text: 'There’s nothing you need to do now.',
      next: (operator: string, start: string) =>
        `${operator} will be in touch about your keys for ${start}.`,
    },
    moved_in: {
      title: 'Welcome home',
      text: (when: string) => `Your keys were handed over on ${when}.`,
      next: (operator: string) =>
        `For anything about your tenancy, talk to a person at ${operator}.`,
    },
  },
  agreement: {
    title: 'Your tenancy agreement',
    notReady: 'Your agreement isn’t ready yet',
    notReadyText: 'We’ll email you a link as soon as it is.',
    contents: 'In this agreement',
    download: 'Download a copy',
    changedTitle: 'This agreement has changed',
    changedText: (operator: string) => `${operator} will send you the new version to sign.`,
    signTitle: 'Sign your agreement',
    nameHint: (name: string) => `As it’s written on the agreement: ${name}.`,
    consent: 'I’ve read the agreement, and I agree to sign it electronically',
    button: 'Sign my tenancy agreement',
    signNext: (operator: string) =>
      `Once you’ve signed, ${operator} signs too, and you’ll both have a copy.`,
    signedTitle: 'You’ve signed',
    signedNext: (operator: string) =>
      `${operator} signs next, and we’ll email you your copy. Then they’ll send you how to pay the deposit and first month’s rent.`,
    bothTitle: 'Signed by both sides',
    bothNext: (operator: string) =>
      `Next, ${operator} sends you how to pay the deposit and first month’s rent.`,
    back: 'Back to your tenancy',
    /** Who has signed, under the agreement and in the copy to download. */
    signatures: {
      tenant: 'Tenant:',
      landlord: 'For the landlord:',
      tenantSigned: (name: string, when: string) => `signed electronically by ${name} on ${when}`,
      onPaper: 'signed on paper',
      landlordSigned: (signer: string, operator: string, when: string) =>
        `signed by ${signer} for ${operator} on ${when}`,
      notYet: 'not signed yet',
    },
  },
  pay: {
    title: 'Pay the deposit and first month’s rent',
    by: (date: string) => `By ${date}`,
    total: 'To pay',
    into: 'Pay into',
    accountName: 'Name on the account',
    iban: 'IBAN',
    reference: 'Reference',
    copyIban: 'the IBAN',
    copyReference: 'the reference',
    notYet: 'The payment details aren’t here yet',
    notYetText: (operator: string) => `${operator} will send them once the agreement is signed.`,
    received: 'Payment received',
    receivedText: (operator: string, total: string, when: string) =>
      `${operator} received your ${total} on ${when}.`,
    next: (operator: string) =>
      `Once the money arrives, ${operator} confirms it here, and we’ll email you a receipt.`,
    receivedNext: (operator: string) => `${operator} will be in touch about moving in.`,
  },
  pps: {
    title: 'Your PPS number',
    why: (operator: string) =>
      `${operator} registers your tenancy with the Residential Tenancies Board, which recommends including it. It’s used only for that, and deleted once the tenancy is registered.`,
    label: 'PPS number',
    hint: 'Seven numbers and one or two letters, like 1234567T.',
    save: 'Save',
    saving: 'Saving…',
    skip: 'Skip',
    given: 'You’ve given your PPS number',
    remove: 'Remove my PPS number',
    removing: 'Removing…',
    notNeeded: 'Your PPS number isn’t needed',
    notNeededText: 'Your tenancy is registered.',
    empty: 'Enter your PPS number, or choose Skip.',
    next: (operator: string) => `Next, ${operator} registers your tenancy with the RTB.`,
    back: 'Back to your tenancy',
  },
  inventory: {
    title: 'Your move-in inventory',
    lead: 'What’s in the home, and its condition, room by room.',
    notYet: 'Your inventory isn’t ready yet',
    notYetText: (operator: string) => `${operator} shares it with you around move-in.`,
    wrong: 'Something’s not right',
    wrongAbout: (item: string) => `Something’s not right: ${item}`,
    sheetTitle: (item: string) => `What’s not right with the ${item.toLowerCase()}?`,
    noteLabel: 'A short note',
    noteHint: (operator: string) => `It goes to ${operator} with this item.`,
    send: (operator: string) => `Send to ${operator}`,
    sending: 'Sending…',
    cancel: 'Cancel',
    noteEmpty: 'Write a short note about what’s not right.',
    noteLong: 'Keep the note to 500 characters.',
    youSaid: 'You said',
    button: 'This is a fair record',
    confirming: 'Confirming…',
    confirmed: 'You’ve confirmed it',
    confirmedText: (when: string) => `On ${when}.`,
    next: (operator: string) =>
      `${operator} is told as soon as you confirm, and sees any notes you’ve sent. It’s the record used when your deposit is returned.`,
    confirmedNext: (operator: string) => `For anything about it, talk to a person at ${operator}.`,
  },
} as const;

/** Outcomes: the home went to someone else, or is no longer available. */
export const closedCopy = {
  let: (address: string) => `${address} has been let`,
  letText: (operator: string) => `${operator} has let the home to another applicant.`,
  withdrawn: (address: string) => `${address} isn’t available any more`,
  withdrawnText: (operator: string) => `${operator} has stopped taking enquiries for it.`,
  thanks: 'Thank you for your interest.',
  noDate: 'Your details are deleted from Gaff soon after.',
  withdrawnApplication: {
    title: 'Your enquiry is closed',
    text: (operator: string) => `To ask about it, talk to a person at ${operator}.`,
  },
} as const;
