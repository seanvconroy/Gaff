/**
 * Words for confirming a mobile and for checks on letters (M3, M22 to M27). Short, plain, and
 * they say what happens next.
 */

export function mobileCodeSms(code: string): string {
  return `Your Gaff code is ${code}. It works for 10 minutes. If you didn't ask for it, ignore this text.`;
}

export const mobileProblems = {
  invalid: 'Enter a mobile number, like 087 123 4567',
  too_soon: 'We’ve just sent a code. Wait 30 seconds before asking for another.',
  too_many: 'That’s the most codes we can send today. Try again tomorrow.',
  wrong: 'That code doesn’t match. Check the text and try again.',
  expired: 'That code has expired. Ask for a new one.',
  locked: 'Too many tries. Ask for a new code.',
  none: 'Ask for a code first.',
  not_sent: 'The text didn’t send. Check the number and try again.',
} as const;

export function licenceCheckedEmail(input: {
  organisationName: string;
  passed: boolean;
  licenceNumber: string;
  whose: 'agency' | 'agent';
  checksUrl: string;
}): { subject: string; text: string } {
  const whose = input.whose === 'agency' ? 'your agency’s' : 'your';
  return input.passed
    ? {
        subject: 'Your PSRA licence is checked',
        text: [
          'Hello,',
          '',
          `We’ve checked ${whose} PSRA licence, ${input.licenceNumber}, on the public register. Renters will see that on your listings.`,
          '',
          `See your checks: ${input.checksUrl}`,
          '',
          'Gaff',
        ].join('\n'),
      }
    : {
        subject: 'We couldn’t match your PSRA licence',
        text: [
          'Hello,',
          '',
          `We couldn’t match ${whose} PSRA licence, ${input.licenceNumber}, to the public register. Check the number and the name match your licence exactly, then save them again, and we’ll check them within one working day.`,
          '',
          `Your checks: ${input.checksUrl}`,
          '',
          'Gaff',
        ].join('\n'),
      };
}

export function invitationEmail(input: {
  organisationName: string;
  inviterName: string;
  url: string;
}): { subject: string; text: string } {
  return {
    subject: `${input.inviterName} invited you to ${input.organisationName} on Gaff`,
    text: [
      'Hello,',
      '',
      `${input.inviterName} invited you to join ${input.organisationName} on Gaff, to let homes together.`,
      '',
      'Join here:',
      input.url,
      '',
      'The link works for 7 days. If you weren’t expecting it, you can ignore this email.',
      '',
      'Gaff',
    ].join('\n'),
  };
}
