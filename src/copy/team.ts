import { refusalWords } from '@/domain/team/members';
import { refusals, roleLabels, type Role } from '@/domain/team/permissions';
import { formatDate, irishToday } from '@/lib/format';

/**
 * Every word of a team's screens (section 2, "Agencies: roles and permissions", "Inviting
 * people", "When an agent leaves"): Team, Invite your team, a member's page, Remove, Change lead,
 * Help with this letting, and leaving from Profile. Plain and short; each screen says what
 * happens next.
 */

/** "today", or "Thursday 6 November". */
function onDay(at: Date, now: Date): string {
  return irishToday(at) === irishToday(now) ? 'today' : formatDate(at, now);
}

const role = (r: Role) => roleLabels[r];

/**
 * A refusal's words, by a short code, so a page can say what went wrong without the words, or
 * anyone's name, in its address.
 */
const problems: Record<string, string> = { ...refusalWords, ...refusals };

export function problemCode(message: string): string {
  return Object.entries(problems).find(([, words]) => words === message)?.[0] ?? 'other';
}

export function problemWords(code: string | undefined): string | null {
  if (!code) return null;
  return Object.hasOwn(problems, code) ? problems[code]! : 'That didn’t work. Try again.';
}
const lettings = (n: number) => (n === 1 ? '1 letting' : `${n} lettings`);

export const teamCopy = {
  metaTitle: 'Team',
  title: 'Team',
  lead: (organisation: string) =>
    `Everyone here can see and run every letting ${organisation} runs.`,
  invite: 'Invite a colleague',
  people: 'People',
  you: 'You',
  memberMeta: (r: Role, leads: number, you: boolean) =>
    [role(r), leads > 0 ? `Leads ${lettings(leads)}` : null, you ? 'You' : null]
      .filter(Boolean)
      .join(' · '),
  invited: {
    title: 'Invited',
    meta: (r: Role, sentAt: Date, now: Date) =>
      `Invited as ${r === 'admin' ? 'an Admin' : 'an Agent'} · sent ${onDay(sentAt, now)}`,
    menu: (email: string) => `More for ${email}`,
    again: 'Send again',
    cancel: 'Cancel',
  },
  requests: {
    title: 'Asked to join',
    meta: (email: string, at: Date, now: Date) => `${email} · asked ${onDay(at, now)}`,
    yes: 'Add to the team',
    no: 'Say no',
  },
  done: {
    sentAgain: 'Sent again. The new invite works for 7 days.',
    cancelled: 'Invite cancelled. Its link no longer works.',
    added: 'They’re on the team now, as an Agent. We’ve emailed to tell them.',
    declined: 'They weren’t added. We’ve emailed to tell them.',
    role: 'Role saved.',
    gone: 'That has already been dealt with.',
  },
  agentsSee:
    'Only an admin can invite people, change roles or remove someone. Ask an admin on the team.',

  inviteFlow: {
    metaTitle: 'Invite your team',
    title: 'Invite your team',
    lead: (organisation: string) =>
      `Each person gets an email with a link to join ${organisation}. It works for 7 days.`,
    emails: 'Email addresses',
    emailsHint: 'Type or paste one or more, with commas or spaces between them.',
    role: 'Their role',
    roles: {
      negotiator: { label: 'Agent', hint: 'Runs lettings, and makes the three decisions.' },
      admin: { label: 'Admin', hint: 'Also invites people and changes the agency’s settings.' },
    },
    send: 'Send invites',
    sending: 'Sending…',
    /** AU12: an organisation sends at most 30 invites an hour. */
    tooMany: (left: number, minutes: number) =>
      left > 0
        ? `You can send ${left} more ${left === 1 ? 'invite' : 'invites'} this hour. Send fewer now, or the rest in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`
        : `You’ve sent 30 invites this hour. You can send more in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`,
    sent: {
      title: (n: number) => (n === 1 ? 'Invite sent' : `${n} invites sent`),
      text: (organisation: string) =>
        `When they sign in from the email, they land in ${organisation} with nothing to set up.`,
      next: 'You’ll see them on Team as soon as they join. Until then, each invite waits there.',
      already: (emails: string[]) => `Already on the team, so not invited: ${emails.join(', ')}.`,
      noneNew: 'Everyone you entered is already on the team.',
      done: 'Back to Team',
      doneToday: 'Back to Today',
    },
  },

  member: {
    email: 'Email',
    role: 'Role',
    joined: 'Joined',
    leads: 'Leads',
    leadsNone: 'No open lettings',
    leadsSome: (n: number) => lettings(n),
    changeRole: 'Change role',
    saveRole: 'Save role',
    saving: 'Saving…',
    remove: (organisation: string) => `Remove from ${organisation}`,
    back: 'Team',
  },

  remove: {
    metaTitle: 'Remove a member',
    title: (name: string, organisation: string) => `Remove ${name} from ${organisation}?`,
    lead: 'They’ll lose access to the team straight away. What they did stays in each letting’s record.',
    handover: (first: string) => `Who takes ${first}’s lettings?`,
    handoverLead: 'Each letting needs a lead. You can change any of them later from the letting.',
    nothingLed: (first: string) => `${first} doesn’t lead any open lettings.`,
    newLead: (address: string) => `New lead for ${address}`,
    you: (name: string) => `${name} (you)`,
    confirm: (first: string) => `Remove ${first}`,
    removing: 'Removing…',
    done: {
      title: (name: string) => `${name} is no longer on the team`,
      text: (first: string, n: number) =>
        n === 0
          ? `${first} can’t open the team’s lettings from now.`
          : `${first} can’t open the team’s lettings from now. Their ${lettings(n)} have new leads, who’ll see them on Today.`,
      next: 'Their own profile is untouched. Messages they’d scheduled still go, from the agency.',
      back: 'Back to Team',
    },
  },

  changeLead: {
    metaTitle: 'Change lead',
    title: 'Who leads this letting?',
    lead: (address: string) =>
      `The lead sees ${address} on their Today. Everyone on the team can still open it.`,
    legend: 'Lead',
    you: (name: string) => `${name} (you)`,
    save: 'Save',
    saving: 'Saving…',
    done: {
      title: (name: string) => `${name} leads this letting now`,
      text: (address: string) => `${address} shows on their Today from now.`,
      back: 'Back to the letting',
    },
  },

  help: {
    menu: 'Change lead',
    leads: (name: string) => `${name} leads this letting`,
    why: 'To work on it, choose Help with this letting. The record shows who did what.',
    button: 'Help with this letting',
    helping: 'Helping…',
  },

  leave: {
    title: 'Your teams',
    lead: 'The agencies and teams you work in on Gaff.',
    meta: (r: Role) => role(r),
    button: (organisation: string) => `Leave ${organisation}`,
    lastAdmin:
      'You’re the only admin. Make someone else an admin on Team first, then you can leave.',
    sheetTitle: (organisation: string) => `Leave ${organisation}?`,
    sheetText:
      'You’ll lose access to its lettings straight away. Any lettings you lead go to an admin, who we’ll email.',
    confirm: 'Leave',
    leaving: 'Leaving…',
    cancel: 'Stay',
    done: (organisation: string) => `You’ve left ${organisation}.`,
  },
} as const;
