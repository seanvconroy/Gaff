/**
 * Emails from Gaff to the people who run lettings, about their agency's place on Gaff (section 2
 * of the UX redesign, "Confirming an agency"). Plain, warm and short. Each ends with what
 * happens next. They go out in the email layout, with one button (`layOutGaffEmail`).
 *
 * A web address on a line of its own becomes the email's button.
 */
export interface AccountEmail {
  subject: string;
  text: string;
  /** What the button says: where it leads. */
  button: string;
}

/** UX-AG-4: the agency is confirmed, and any home that was waiting has gone live. */
export function agencyConfirmedEmail(input: {
  agencyName: string;
  /** Homes a member had already decided to put live, which went live just now. */
  wentLive: number;
  todayUrl: string;
}): AccountEmail {
  const homes =
    input.wentLive === 0
      ? 'You can put a home live whenever it’s ready.'
      : input.wentLive === 1
        ? 'The home you were ready to put live is live now, and Gaff is answering its enquiries.'
        : `The ${input.wentLive} homes you were ready to put live are live now, and Gaff is answering their enquiries.`;
  return {
    subject: `${input.agencyName} is confirmed on Gaff`,
    button: 'Open Gaff',
    text: [
      'Hello,',
      '',
      `We’ve confirmed ${input.agencyName} on Gaff. ${homes}`,
      '',
      input.todayUrl,
      '',
      'Renters now see your agency’s name and PSRA licence number on every page and message.',
      '',
      'Gaff',
    ].join('\n'),
  };
}

/** UX-AG-5: a founder set the agency up for a pilot and invites its first admin. */
export function agencyInviteEmail(input: {
  agencyName: string;
  joinUrl: string;
  days: number;
}): AccountEmail {
  return {
    subject: `Join ${input.agencyName} on Gaff`,
    button: `Join ${input.agencyName}`,
    text: [
      'Hello,',
      '',
      `Gaff’s team has set up ${input.agencyName} on Gaff and invited you to run it, as its first admin.`,
      '',
      input.joinUrl,
      '',
      `Sign in with this email address and you’ll land in ${input.agencyName}, ready to add your first letting. There’s nothing to set up. The invitation works for ${input.days} days.`,
      '',
      'Gaff',
    ].join('\n'),
  };
}

/** UX-AG-11: an admin invites a colleague. Who invited them, to which agency, and one button. */
export function colleagueInviteEmail(input: {
  inviterName: string;
  agencyName: string;
  joinUrl: string;
  days: number;
}): AccountEmail {
  return {
    subject: `${input.inviterName} invited you to join ${input.agencyName} on Gaff`,
    button: `Join ${input.agencyName}`,
    text: [
      'Hello,',
      '',
      `${input.inviterName} has invited you to join ${input.agencyName} on Gaff, where the team runs its lettings.`,
      '',
      input.joinUrl,
      '',
      `Sign in with this email address and you’ll land in ${input.agencyName}, with every letting in front of you. The invitation works for ${input.days} days.`,
      '',
      'Gaff',
    ].join('\n'),
  };
}

/** UX-AG-3: an admin answered a request to join. */
export function joinAnsweredEmail(input: {
  agencyName: string;
  approved: boolean;
  url: string;
}): AccountEmail {
  return input.approved
    ? {
        subject: `You’re in ${input.agencyName} on Gaff`,
        button: `Open ${input.agencyName}`,
        text: [
          'Hello,',
          '',
          `${input.agencyName} said yes to your request to join. You can see and run its lettings on Gaff from now.`,
          '',
          input.url,
          '',
          'Gaff',
        ].join('\n'),
      }
    : {
        subject: `Your request to join ${input.agencyName}`,
        button: 'Open Gaff',
        text: [
          'Hello,',
          '',
          `${input.agencyName} didn’t add you to its team on Gaff. If you work there, ask one of its admins to invite you.`,
          '',
          input.url,
          '',
          'Gaff',
        ].join('\n'),
      };
}

/** UX-AG-17: a member left, and an admin has their lettings now. */
export function memberLeftEmail(input: {
  memberName: string;
  agencyName: string;
  /** How many lettings they led, which are this admin's now. */
  lettings: number;
  lettingsUrl: string;
}): AccountEmail {
  const yours =
    input.lettings === 0
      ? 'They didn’t lead any lettings, so nothing has moved.'
      : input.lettings === 1
        ? 'You lead the letting they led now.'
        : `You lead the ${input.lettings} lettings they led now.`;
  return {
    subject: `${input.memberName} has left ${input.agencyName}`,
    button: 'Open your lettings',
    text: [
      'Hello,',
      '',
      `${input.memberName} has left ${input.agencyName} on Gaff. ${yours} You can give any of them to someone else on the team from the letting.`,
      '',
      input.lettingsUrl,
      '',
      'Gaff',
    ].join('\n'),
  };
}

/** UX-AG-6: the weekly check didn't find the agency's licence on the PSRA register. */
export function licenceLapsedEmail(input: {
  agencyName: string;
  licenceNumber: string;
  lettingsUrl: string;
}): AccountEmail {
  return {
    subject: `${input.agencyName}: your PSRA licence isn’t on this week’s register`,
    button: 'Open your lettings',
    text: [
      'Hello,',
      '',
      `Gaff checks the PSRA’s register every week. This week it doesn’t list licence ${input.licenceNumber} for ${input.agencyName}.`,
      '',
      'The homes you have live carry on as they are. A new home can’t go live until the licence is back on the register.',
      '',
      input.lettingsUrl,
      '',
      'We check again every week, and we’ll email you as soon as it’s back.',
      '',
      'Gaff',
    ].join('\n'),
  };
}

/** UX-AG-6: the licence is back on the register. */
export function licenceRenewedEmail(input: {
  agencyName: string;
  lettingsUrl: string;
}): AccountEmail {
  return {
    subject: `${input.agencyName}: your PSRA licence is back on the register`,
    button: 'Open your lettings',
    text: [
      'Hello,',
      '',
      `This week’s PSRA register lists ${input.agencyName}’s licence again. You can put new homes live from now.`,
      '',
      input.lettingsUrl,
      '',
      'Gaff',
    ].join('\n'),
  };
}

/** UX-AC-14: an admin is told that a colleague can't work on a letting, and why. */
export function memberConflictEmail(input: {
  memberName: string;
  address: string;
  lettingUrl: string;
}): AccountEmail {
  return {
    subject: `${input.address}: someone else needs to run this letting`,
    button: 'Open the letting',
    text: [
      'Hello,',
      '',
      `${input.memberName} enquired about ${input.address} as a renter. So that nobody decides on their own application, Gaff has stopped them opening that letting or deciding anything on it.`,
      '',
      'Someone else on your team needs to run it from here.',
      '',
      input.lettingUrl,
      '',
      'Gaff',
    ].join('\n'),
  };
}

/**
 * UX-PF-7 (rule 9, Q25): a renter's profile hasn't been used for almost two years. This says
 * when it will be deleted, 30 days ahead, and how to keep it: by signing in.
 */
export function profileUnusedEmail(input: {
  /** "Friday 17 November 2028" */
  deleteOn: string;
  profileUrl: string;
}): AccountEmail {
  return {
    subject: `Your Gaff profile will be deleted on ${input.deleteOn}`,
    button: 'Keep my profile',
    text: [
      'Hello,',
      '',
      `You haven’t used your Gaff profile for almost two years, so we’ll delete it on ${input.deleteOn}. That’s the details you kept for next time, and your sign-in.`,
      '',
      'To keep it, sign in before then.',
      '',
      input.profileUrl,
      '',
      'If you don’t need it any more, there’s nothing to do.',
      '',
      'Gaff',
    ].join('\n'),
  };
}

/** BA-8 (AU11): the ways in a security email can be about, as a person says them. */
const wayInWords = { google: 'Google', apple: 'Apple' } as const;
export type ChangedWayIn = 'google' | 'apple' | 'passkey';

/**
 * BA-8 (AU11, for the solicitor): a way in was added to, or removed from, the person's own
 * account. To the person, about their own sign-in. It says what happened and when, and what to
 * do if it wasn't them. New wording, pinned by its own test (`security-emails.test.ts`).
 */
export function signInChangedEmail(input: {
  change: 'added' | 'removed';
  method: ChangedWayIn;
  /** "Thursday 6 November, 6pm" */
  when: string;
  profileUrl: string;
}): AccountEmail {
  const happened =
    input.method === 'passkey'
      ? input.change === 'added'
        ? 'A passkey was added to your Gaff account'
        : 'A passkey was removed from your Gaff account'
      : input.change === 'added'
        ? `${wayInWords[input.method]} was connected to your Gaff account`
        : `${wayInWords[input.method]} was disconnected from your Gaff account`;
  return {
    subject: happened,
    button: 'See how you sign in',
    text: [
      'Hello,',
      '',
      `${happened} on ${input.when}.`,
      '',
      'If that was you, there’s nothing to do.',
      '',
      'If it wasn’t, sign in to Gaff with a code from your email and open your profile. Under “How you sign in” you can remove anything you don’t recognise, and sign out every other device.',
      '',
      input.profileUrl,
      '',
      'Gaff',
    ].join('\n'),
  };
}

/**
 * BA-8 (AU4, AU11, for the solicitor): someone tried to sign in to Gaff with Google or Apple
 * using the person's address, and wasn't let in, because that provider doesn't look after the
 * address. It goes to the address's owner only, so nobody else learns whether it has an
 * account. Pinned with the above.
 */
export function signInRefusedEmail(input: {
  provider: 'google' | 'apple';
  when: string;
  profileUrl: string;
}): AccountEmail {
  const provider = wayInWords[input.provider];
  return {
    subject: 'Someone tried to sign in to Gaff with your email',
    button: 'See how you sign in',
    text: [
      'Hello,',
      '',
      `On ${input.when}, someone tried to sign in to Gaff with ${provider}, using this email address. We didn’t let them in, because ${provider} doesn’t look after this address.`,
      '',
      `If that was you, sign in with a code from your email instead. Then connect ${provider} under “How you sign in” on your profile, and you can use it from then on.`,
      '',
      input.profileUrl,
      '',
      'If it wasn’t you, there’s nothing to do. Nothing has changed on your account.',
      '',
      'Gaff',
    ].join('\n'),
  };
}
