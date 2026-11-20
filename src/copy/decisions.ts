import { formatRatio } from '@/domain/applications/apply';
import { formatDate, formatDateTime } from '@/lib/format';

/**
 * Every word of the decision flows (WP-17, section 4 of the UX redesign: "The first decision:
 * who views", "Choosing an applicant", "Checks", "The owner's approval", "Making the offer").
 * The person deciding reads these. Plain, warm Irish English: short sentences, no exclamation
 * marks, no blame. Each screen ends with what happens next, and when.
 *
 * Gaff ranks, ticks and drafts; it never chooses (rule 1). Nothing here recommends a person:
 * beside a name there is only what was asked ("Meets 3 of 4") and when (Q36). The messages
 * renters and owners get are fixed templates (src/copy/templates), shown and never edited here.
 */

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const people = (n: number) => count(n, 'person', 'people');

/** "just now", "20 minutes ago", "2 hours ago", "3 days ago". */
export function agoWords(since: Date, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - since.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${count(minutes, 'minute', 'minutes')} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${count(hours, 'hour', 'hours')} ago`;
  return `${count(Math.floor(hours / 24), 'day', 'days')} ago`;
}

/** A name, or "the owner", at the start of a sentence. */
const cap = (words: string) => words.charAt(0).toUpperCase() + words.slice(1);

/** "Aoife", "Aoife and Ciarán". */
export const both = (first: string, second: string | null) =>
  second ? `${first} and ${second}` : first;

/** What sits beside a person: only what was asked of them (Q36). */
export function meetsWords(row: { met: number; total: number; answered: boolean }): string {
  if (row.total === 0) return 'No criteria set';
  if (!row.answered) return 'Hasn’t answered the questions yet';
  return `Meets ${row.met} of ${row.total}`;
}

export const decisionsCopy = {
  done: 'Done',
  next: 'Next',
  back: 'Back',
  change: 'Change',
  close: 'Close',

  /** UX-DC-1 to UX-DC-6: the first decision. */
  whoViews: {
    metaTitle: 'Choose who views',
    progress: 'Choose who views',
    steps: ['Choose', 'Check and send'] as const,
    noTimes: {
      title: 'First, add a viewing time',
      lead: 'Invitations ask people to book one of your viewing times. Add one, then choose who views.',
      action: 'Add a viewing time',
    },
    nobody: {
      title: 'Nobody is waiting to hear',
      text: 'Everyone who enquired has been invited, put on the waiting list or told they’ll hear either way. Anyone new is on Today as they enquire.',
    },
    closed: {
      title: 'This home isn’t taking enquiries',
      text: 'Invitations go out only while a home is live.',
    },
    title: 'Choose who views',
    lead: (places: number) =>
      places === 0
        ? 'Every place is taken, so nobody is ticked. Tick anyone you’d like to invite. Nothing is sent until you press Send invitations.'
        : `Gaff ticked the top ${people(places)}, one for each place. Change any tick. Nothing is sent until you press Send invitations.`,
    howRanks: 'How Gaff ranks',
    howRanksText:
      'Everyone is ranked the same way: by how many of your criteria they meet, then by when they enquired. People who haven’t answered yet come after everyone who has. The ranking reads only the answers to your criteria and the time of each enquiry, never anything else about a person.',
    legend: 'Who to invite',
    summary: (places: number) => `${count(places, 'place', 'places')} · {n} chosen`,
    laterHeading: 'Haven’t answered the questions yet',
    why: 'Why here',
    noneTicked: 'Tick at least one person to invite.',
    waitlist: {
      title: 'How many on the waiting list?',
      lead: 'They’re the next people in the ranking. If a place frees up, Gaff offers it to them.',
      label: 'People on the waiting list',
      hint: (most: number) => `Up to ${most}.`,
      error: (most: number) => `Enter a number from 0 to ${most}.`,
    },
    check: {
      title: 'Check and send',
      summary: (counts: { invited: number; waitlisted: number; told: number }) =>
        [
          `You’re inviting ${people(counts.invited)}.`,
          counts.waitlisted > 0
            ? `The next ${counts.waitlisted} go on the waiting list.`
            : 'Nobody goes on the waiting list.',
          counts.told > 0
            ? `${counts.told} ${counts.told === 1 ? 'other' : 'others'} will be told they’ll hear either way once a tenant is chosen.`
            : null,
        ]
          .filter(Boolean)
          .join(' '),
      unoffered: (n: number) =>
        `${n === 1 ? '1 place won’t' : `${n} places won’t`} be offered. Invite more?`,
      inviteMore: 'Invite more',
      invited: 'Invited to book',
      waitlisted: 'On the waiting list',
      told: 'Told they’ll hear either way',
      nobody: 'Nobody',
      peopleCount: people,
      seeMessage: 'See the message',
      fixed: 'Each message’s wording is fixed. Gaff puts in each person’s name and the home.',
      send: 'Send invitations',
      sending: 'Sending…',
    },
    sent: {
      title: 'Invitations sent',
      text: (counts: { invited: number; waitlisted: number; told: number }) =>
        `${counts.invited} invited to book a viewing, ${counts.waitlisted} on the waiting list, and ${counts.told} told they’ll hear either way.`,
      next: 'Gaff will tell you as people book.',
    },
  },

  /** UX-DC-7 to UX-DC-9: choosing an applicant, and a backup. */
  choose: {
    metaTitle: 'Choose an applicant',
    progress: 'Choose an applicant',
    steps: ['Choose', 'Backup', 'Confirm'] as const,
    title: 'Choose an applicant',
    lead: (n: number) =>
      `${count(n, 'person has', 'people have')} applied, in the same order as your shortlist. You can change your choice until you make the offer.`,
    legend: 'Who to offer the home to',
    choose: 'Choose',
    noneChosen: 'Choose an applicant.',
    nowPreferred: 'Your choice now',
    nowBackup: 'Backup now',
    criteria: 'Criteria',
    income: 'Take-home income',
    incomeWords: (amount: string, ratioTenths: number) =>
      `${amount} a month, ${formatRatio(ratioTenths)} times the rent`,
    meetsRule: 'Meets your income rule',
    belowRule: 'Below your income rule',
    ruleIs: (ruleTenths: number) => `Your rule is ${formatRatio(ruleTenths)} times the rent.`,
    earns: 'How they earn',
    notGiven: 'Not given',
    applied: 'Applied',
    waitingToApply: (names: string[]) =>
      `Came to view and haven’t applied yet: ${names.join(', ')}. They appear here as they apply.`,
    empty: {
      title: 'Nobody has applied yet',
      text: 'People you mark as having come to a viewing are asked to apply when it ends. Each appears on Today as they apply.',
    },
    locked: {
      title: 'The offer has been made',
      text: 'An offer is out, so the choice can’t change now. If it isn’t accepted, you can choose again.',
    },
    backup: {
      title: 'Add a backup?',
      lead: (first: string) =>
        `If ${first} doesn’t take the home, you can offer it to your backup. A backup has the same checks.`,
      legend: 'Your backup',
      none: 'No backup',
      noneHint: 'Only the person you chose has checks.',
      error: 'Choose a backup, or No backup.',
    },
    check: {
      title: 'Check and confirm',
      text: (first: string, backup: string | null) =>
        backup
          ? `Gaff will ask ${first} and ${backup} for an ID check, work and income documents and references. It tells them what each is for. Neither is told who’s first.`
          : `Gaff will ask ${first} for an ID check, work and income documents and references. It tells them what each is for.`,
      preferred: 'Your choice',
      backup: 'Backup',
      start: 'Start the checks',
      starting: 'Starting…',
    },
    started: {
      title: 'Checks started',
      text: (first: string, backup: string | null) =>
        `Gaff has emailed ${both(first, backup)} about the checks.`,
      next: 'You’ll see each result as it comes in. When they’re all back, Gaff puts it on Today.',
    },
  },

  /** UX-DC-10 to UX-DC-13: checks. */
  checks: {
    metaTitle: 'Checks',
    running: {
      title: 'The checks are under way',
      lead: 'There’s nothing for you to do. When every check is back, Gaff puts it on Today.',
    },
    back: {
      title: (first: string) => `The checks are back for ${first}`,
      lead: 'Here is what each check found. Next, the offer.',
      continue: 'Continue to the offer',
    },
    /** A check's state beside its result. */
    done: 'Done',
    underWay: 'Under way',
    none: {
      title: 'Nobody has checks yet',
      text: 'Checks start when you choose an applicant.',
      action: 'Choose an applicant',
    },
    preferredHeading: (name: string) => name,
    backupHeading: (name: string) => `${name}, your backup`,
    askAbout: (first: string) => `Ask ${first} about this`,
    chooseElse: 'Choose someone else',
    waitingOn: (who: string, days: number) =>
      `Waiting on ${who} for ${count(days, 'day', 'days')}.`,
    remind: 'Send a reminder',
    reminding: 'Sending…',
    reminded: (who: string) => `Reminder sent to ${who}.`,
  },

  /** UX-DC-14 to UX-DC-16: the owner's approval. */
  owner: {
    metaTitle: 'Ask the owner',
    theOwner: 'the owner',
    details: {
      title: 'Who owns this home?',
      lead: 'Gaff sends them a one-page summary of who you chose, to approve. There’s nothing for them to sign up for.',
      name: 'Owner’s name',
      email: 'Owner’s email',
      already: 'The owner has already approved',
    },
    ask: {
      title: (owner: string) => `Ask ${owner} to approve`,
      lead: (owner: string) =>
        `${cap(owner)} gets a private link to a one-page summary, and approves or declines each person.`,
      sees: (owner: string) => `What ${owner} will see`,
      preferred: 'The tenant you chose',
      backup: 'Your backup',
      incomeLabel: 'Income they gave',
      stillUnderWay: 'Still under way',
      income: (ratioTenths: number, meets: boolean) =>
        `${formatRatio(ratioTenths)} times the rent: ${meets ? 'meets' : 'below'} your rule`,
      underWay: (n: number, owner: string) =>
        `${n === 1 ? '1 check isn’t' : `${n} checks aren’t`} back yet. ${cap(owner)} will see “Still under way” beside ${n === 1 ? 'it' : 'them'}.`,
      already: (owner: string) => `${cap(owner)} has already approved`,
      send: (owner: string) => `Send to ${owner}`,
      sending: 'Sending…',
    },
    sent: {
      title: (owner: string) => `Sent to ${owner}`,
      text: (owner: string) => `${cap(owner)} has a private link to approve or decline.`,
      next: (owner: string) => `Gaff tells you on Today as soon as ${owner} answers.`,
    },
    confirmed: {
      title: (owner: string) => `Recorded: ${owner} has approved`,
      text: (today: Date) =>
        `Recorded as ${formatDate(today)}. It goes with the offer, as your confirmation.`,
      continue: 'Continue to the offer',
    },
    waiting: {
      line: (owner: string, sent: Date, now?: Date) =>
        `Waiting for ${owner} · sent ${agoWords(sent, now)}`,
      title: (owner: string) => `Waiting for ${owner}`,
      text: (owner: string) =>
        `${cap(owner)} has a private link to a one-page summary. Gaff tells you on Today as soon as ${owner} answers.`,
      remind: (owner: string) => `Remind ${owner}`,
      reminding: 'Sending…',
      reminded: (owner: string) => `Reminder sent. ${cap(owner)} has a new link.`,
    },
    answered: {
      approved: (owner: string, first: string, backup: string | null) =>
        backup
          ? `${cap(owner)} approved ${first}, and ${backup} as backup`
          : `${cap(owner)} approved ${first}`,
      approvedNoBackup: (owner: string, first: string, backup: string) =>
        `${cap(owner)} approved ${first}, and not ${backup} as backup`,
      declined: (owner: string, first: string) => `${cap(owner)} said no to ${first}`,
      declinedText: 'Talk to them, then choose again.',
      chooseAgain: 'Choose again',
      continue: 'Continue to the offer',
    },
  },

  /** UX-DC-17 to UX-DC-20: the offer. */
  offer: {
    metaTitle: 'The offer',
    progress: 'The offer',
    steps: ['The offer', 'Check and send'] as const,
    title: 'The offer',
    lead: (first: string) => `To ${first}. Check the terms, then send.`,
    rent: 'Rent',
    rentValue: (rent: string) => `${rent} a month`,
    deposit: 'Deposit',
    depositValue: (deposit: string, capped: boolean) =>
      capped ? `${deposit}, one month’s rent, the most allowed` : deposit,
    depositHint: (rent: string) => `No more than one month’s rent: ${rent}.`,
    startDate: 'Move-in date',
    deadline: 'Time to answer',
    deadlineValue: (hours: number) => (hours === 72 ? '3 days' : `${hours} hours`),
    backupRow: (first: string, backup: string) =>
      `If ${first} says no or doesn’t answer, offer it to ${backup}`,
    backupHint:
      'Your decision now, made in advance. Gaff carries it out only if you leave this on.',
    blockers: {
      owner: {
        ask: (owner: string) => `${cap(owner)} hasn’t approved yet.`,
        waiting: (owner: string, sent: Date | null) =>
          sent ? `Waiting for ${owner} · sent ${agoWords(sent)}.` : `Waiting for ${owner}.`,
        declined: (owner: string) => `${cap(owner)} said no to the tenant you chose.`,
        askLink: (owner: string) => `Ask ${owner}`,
        waitingLink: (owner: string) => `Remind ${owner}`,
        declinedLink: 'Choose again',
      },
      comparables: (recorded: number) =>
        `Three comparable rents are needed before the offer. ${recorded} of 3 recorded.`,
      comparablesLink: 'Add comparable rents',
      checks: (n: number) => `${n === 1 ? '1 check isn’t' : `${n} checks aren’t`} back yet.`,
      checksLink: 'See the checks',
      withoutChecks: 'Go ahead without waiting for them',
      withoutChecksHint: 'The offer goes now, before every check is back.',
      stillMissing: 'This is needed before the offer can go.',
    },
    check: {
      title: 'Check and send',
      lead: (first: string) => `This is the message ${first} will get. Its wording is fixed.`,
      label: 'The offer',
      send: (first: string) => `Send the offer to ${first}`,
      sending: 'Sending…',
    },
    sent: {
      title: 'Offer sent',
      text: (first: string, until: Date) =>
        `${first} has until ${formatDateTime(until)}. Gaff will tell you as soon as ${first} answers.`,
      backup: (backup: string) =>
        `If it isn’t accepted in time, it goes to ${backup}, as you decided.`,
    },
    out: {
      title: (first: string) => `Waiting for ${first}`,
      text: (first: string, until: Date) =>
        `The offer is with ${first} until ${formatDateTime(until)}. Gaff tells you as soon as ${first} answers.`,
    },
    accepted: {
      title: (first: string) => `${first} accepted`,
      text: 'The home is let, and everyone else has been told. Next come the tenancy agreement, the deposit and first month’s rent, and the RTB registration.',
      action: 'Go to the tenancy',
    },
    nobody: {
      title: 'Choose an applicant first',
      text: 'The offer goes to the person you choose.',
      action: 'Choose an applicant',
    },
  },

  /** UX-DC-10, UX-DC-16: what the letting's page says while Gaff waits on someone else. */
  underWay: {
    checks: (names: string) =>
      `Checks under way for ${names}. There’s nothing for you to do: Gaff puts it on Today when they’re back.`,
    seeChecks: 'See the checks',
    offerOut: (first: string, until: Date) =>
      `The offer is with ${first} until ${formatDateTime(until)}.`,
  },
};
