import type { ForwardingService } from '@/domain/enquiries/forwarding';

/**
 * The words of forwarding enquiries to Gaff (section 4 of the UX redesign, "Forwarding
 * enquiries", UX-LT-17 to UX-LT-20). Four screens, done once per account. The steps are the
 * person's own, in their own mail: Gaff never signs in to a mail service or a portal (Q31).
 *
 * The steps are written against each mail service's settings as they are in November 2026.
 * Check them against the real screens before the first pilot (launch checklist).
 */

export const serviceNames: Record<ForwardingService, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  other: 'your email',
};

/**
 * The page in each mail service where its forwarding is set. A link the person opens in their
 * own browser: Gaff never fetches it. "Something else" has none.
 */
export const settingsLinks: Record<ForwardingService, string | null> = {
  gmail: 'https://mail.google.com/mail/u/0/#settings/fwdandpop',
  outlook: 'https://outlook.office.com/mail/options/mail/rules',
  other: null,
};

/** What a rule matches: mail from the portals, and Gaff's test sender. */
export function ruleFrom(testSender: string, joiner: 'OR' | ','): string {
  return joiner === 'OR'
    ? `daft.ie OR myhome.ie OR ${testSender}`
    : `daft.ie, myhome.ie, ${testSender}`;
}

export const forwardingCopy = {
  flow: 'Forward your enquiries',
  segments: ['Your email', 'Forward', 'Confirm', 'Test'],
  next: 'Next',
  back: 'Back',

  service: {
    title: 'Where do your Daft enquiries arrive?',
    lead: 'Gaff shows you how to forward them, a step at a time. It takes about five minutes.',
    choose: 'Choose where your Daft enquiries arrive',
    options: {
      gmail: { label: 'Gmail', help: 'Including Google Workspace' },
      outlook: { label: 'Outlook or Microsoft 365', help: 'Including Hotmail and Live' },
      other: { label: 'Something else', help: 'Any other email' },
    } satisfies Record<ForwardingService, { label: string; help: string }>,
  },

  steps: {
    title: 'Forward them to Gaff',
    lead: 'Send enquiries from Daft and MyHome to your Gaff address. Gaff answers each one within minutes.',
    address: 'Your Gaff address',
    copyAddress: 'your Gaff address',
    rule: 'Mail from',
    copyRule: 'what the rule matches',
    label: (service: ForwardingService) =>
      service === 'other' ? 'Steps in your email' : `Steps in ${serviceNames[service]}`,
    open: {
      gmail: 'Open Gmail’s settings',
      outlook: 'Open Outlook’s rules',
      other: '',
    } satisfies Record<ForwardingService, string>,
    opensElsewhere: '(opens in a new tab)',
    done: 'I’ve done that',
    list: {
      gmail: [
        'Open Gmail’s settings at Forwarding and POP/IMAP, and choose Add a forwarding address.',
        'Paste your Gaff address, then choose Next and Proceed.',
        'Gmail sends Gaff a confirmation code. Choose I’ve done that, and Gaff shows it to you.',
      ],
      outlook: [
        'Open Outlook’s rules and choose Add new rule. Call it Gaff.',
        'Add the condition Sender address includes, and enter what’s under “Mail from”.',
        'Add the action Forward to, paste your Gaff address, and choose Save.',
      ],
      other: [
        'In your email’s settings, find Forwarding, Rules or Filters.',
        'Forward mail from what’s under “Mail from” to your Gaff address.',
        'If it asks you to confirm the address, choose I’ve done that, and Gaff shows you the code or link.',
      ],
    } satisfies Record<ForwardingService, readonly string[]>,
  },

  confirm: {
    waitingTitle: (service: ForwardingService) =>
      service === 'outlook'
        ? 'Outlook doesn’t usually ask to confirm'
        : `Waiting for ${serviceNames[service]}’s confirmation`,
    waitingLead: (service: ForwardingService) =>
      service === 'outlook'
        ? 'If it sends a code to your Gaff address, it shows here. If not, send a test enquiry to check your rule.'
        : `${service === 'gmail' ? 'Gmail' : 'Your email'} sends a code or a link to your Gaff address. It usually takes a minute, and it shows here when it comes.`,
    nothingYet: (service: ForwardingService) =>
      service === 'outlook'
        ? 'Nothing to confirm? Then your rule is ready to test.'
        : service === 'other'
          ? 'Not every email asks to confirm. If nothing comes in a few minutes, send a test enquiry to check your rule.'
          : 'Nothing after five minutes? Check your Gaff address was pasted exactly, then add it again.',
    checkAgain: 'Check again',
    foundTitle: 'Confirm it in your email',
    thenFilter: 'Then make the filter below.',
    thenStarts: 'Forwarding starts once you do.',
    /** Gmail: once the address is confirmed, the filter that forwards only enquiries. */
    gmailFilter: {
      label: 'Then forward only enquiries',
      list: [
        'In Gmail’s search bar, open the search options. In From, enter what’s under “Mail from”.',
        'Choose Create filter, then tick Forward it to and pick your Gaff address.',
        'Choose Create filter again. Forwarding starts straight away.',
      ],
    },
    to: 'Your email address',
    toHint:
      'Where your Daft enquiries arrive. Gaff emails a made-up enquiry there, for your rule to forward back.',
    toProblem: 'Enter your email address, like ann@example.ie',
    send: 'Send a test enquiry',
    sending: 'Sending…',
    sendProblem: 'That didn’t send. Check your connection and try again.',
  },

  test: {
    waitingTitle: 'Your test enquiry is on its way',
    waitingLead: (testSender: string) =>
      `Gaff emailed a made-up enquiry to your inbox, from ${testSender}. Your rule should forward it to Gaff within a minute or two, and this page shows Gaff’s answer when it does.`,
    nothingYet: (testSender: string) =>
      `Nothing after five minutes? Check your rule forwards mail from ${testSender}, then send it again.`,
    checkAgain: 'Check again',
    sendAgain: 'Send it again',
    arrivedTitle: 'It works',
    arrivedLead:
      'Your test enquiry came through your rule, and Gaff answered it. From now on Gaff answers every Daft and MyHome enquiry within minutes.',
    replyLabel: (name: string) => `Gaff’s answer to ${name}, a made-up renter`,
    subject: 'Subject',
    noHome:
      'Once a home is live, Gaff answers each of its enquiries like this, with your home’s details.',
    done: 'Done',
  },

  /** In Settings, under the Gaff address. */
  settings: {
    start: 'Set up forwarding',
    again: 'Set it up again',
    inPlace: 'Forwarding is working. Enquiries from Daft and MyHome reach Gaff.',
    toDo: 'Forward your Daft and MyHome enquiries here, and Gaff answers every one.',
  },
};

/**
 * UX-LT-19: the made-up enquiry Gaff emails to the person's own mailbox, for their rule to send
 * back. It is to the person setting up forwarding, never to a renter, and it says what it is.
 */
export function testEnquiryEmail(input: { ref: string; refLine: string; renterName: string }): {
  subject: string;
  text: string;
} {
  return {
    subject: `Test enquiry from Gaff (${input.ref})`,
    text: [
      'This is a made-up enquiry from Gaff, to check your forwarding rule. You don’t need to do anything with it.',
      '',
      `Name: ${input.renterName}`,
      'Message: Hello, is the home still available? I’d like to view it.',
      '',
      input.refLine,
      '',
      'Your rule forwards this to Gaff within a minute or two, and Gaff shows you its answer.',
      '',
      'Gaff',
    ].join('\n'),
  };
}
