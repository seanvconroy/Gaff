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
