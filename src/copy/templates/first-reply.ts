import { formatDate, formatRent } from '@/lib/format';

/**
 * R7: the first reply to every enquiry. Fixed wording (open question Q1): the solicitor reviews
 * it once and Gaff only fills in names, dates and links, so it can go out within minutes even
 * when approve-before-send is on. It says it's an AI assistant (EU AI Act), that a person
 * decides, how to reach a person, and what happens next.
 */
export const FIRST_REPLY_TEMPLATE = 'first_reply@2';

/** M28: every first reply says no money is asked for before an agreement is signed. */
export const NO_MONEY_BEFORE_SIGNING =
  'You’ll never be asked for money before you sign a tenancy agreement. If anyone asks, don’t send any, and reply to let us know.';

export interface FirstReplyInput {
  renterName: string;
  operatorName: string;
  address: string;
  area: string;
  rentCents: number;
  availableFrom: string;
  /** The renter's private link to the pre-viewing questions (R9), if the criteria need any. */
  questionsUrl: string | null;
  /** M76: they answered the questions when they enquired on Gaff. */
  answered?: boolean;
  firstViewing: Date | null;
  privacyUrl: string;
}

/** "Halcyon Lettings’" but "Ann’s". */
export function possessive(name: string): string {
  return /s$/i.test(name.trim()) ? `${name.trim()}’` : `${name.trim()}’s`;
}

function firstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? '';
  return /^[\p{L}'’-]{2,}$/u.test(first) ? first : 'there';
}

export function firstReply(input: FirstReplyInput, now: Date = new Date()) {
  const lines = [
    `Hello ${firstName(input.renterName)},`,
    '',
    `Thanks for your enquiry about ${input.address}, ${input.area}.`,
    '',
    `I’m ${possessive(input.operatorName)} AI assistant. I’ll help with your enquiry, and a person at ${input.operatorName} makes every decision. If you’d rather talk to a person, just reply and say so.`,
    '',
  ];
  if (input.questionsUrl && input.answered) {
    lines.push(
      'Thanks for answering the questions. You can see your answers, and change them until viewings are decided, here:',
      input.questionsUrl,
      '',
    );
  } else if (input.questionsUrl) {
    lines.push(
      'So we can consider you for a viewing, please answer a few quick questions. It takes about a minute, and you don’t need an account:',
      input.questionsUrl,
      '',
    );
  } else {
    lines.push('You don’t need to do anything else for now.', '');
  }
  const viewings = input.firstViewing
    ? `Viewings start on ${formatDate(input.firstViewing, now)}. If you’re invited, you’ll get a link to book a time that suits you. Either way, you’ll hear back from us.`
    : 'If you’re invited to view, you’ll get a link to book a time that suits you. Either way, you’ll hear back from us.';
  lines.push(
    `The rent is ${formatRent(input.rentCents)}, and the home is available from ${formatDate(input.availableFrom, now)}. ${viewings}`,
  );
  lines.push('', NO_MONEY_BEFORE_SIGNING);
  lines.push('', `How we use your details: ${input.privacyUrl}`, '', input.operatorName);
  return {
    subject: `Your enquiry about ${input.address}`,
    body: lines.join('\n'),
  };
}
