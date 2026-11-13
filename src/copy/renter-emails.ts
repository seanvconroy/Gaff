/** Emails to renters from Gaff itself (not from a letter). Plain, short, and what happens next. */

/** M76: the code a renter types into the enquiry sheet. The code is the subject too. */
export function signInCodeEmail(code: string): { subject: string; text: string } {
  return {
    subject: `${code} is your Gaff code`,
    text: [
      'Hello,',
      '',
      `Your code is ${code}.`,
      '',
      'Type it where you asked for it. It works for the next 10 minutes. If you didn’t ask for a code, you can ignore this email: nothing happens without it.',
      '',
      'Gaff',
    ].join('\n'),
  };
}
