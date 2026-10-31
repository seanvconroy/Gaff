/** Email to operators. Plain, warm and short, like everything Gaff writes. */

export function signInEmail(url: string): { subject: string; text: string } {
  return {
    subject: 'Your sign-in link for Gaff',
    text: [
      'Hello,',
      '',
      "Here's your link to sign in to Gaff:",
      '',
      url,
      '',
      "It works once, for the next 15 minutes. If you didn't ask for it, you can ignore this email.",
      '',
      'Gaff',
    ].join('\n'),
  };
}
