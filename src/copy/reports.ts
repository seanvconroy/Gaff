/** M96, M98: emails to people who reported a listing, if they gave an address. */

export function reportReceivedEmail(input: { title: string; reviewBy: string }): {
  subject: string;
  text: string;
} {
  return {
    subject: 'Thanks for your report',
    text: [
      'Hello,',
      '',
      `Thanks for reporting the listing “${input.title}”. A person at Gaff will look at it by ${input.reviewBy}, and we’ll email you what we decided.`,
      '',
      'If you’ve paid money to anyone for this home, contact your bank straight away, and report it to the Gardaí.',
      '',
      'Gaff',
    ].join('\n'),
  };
}

export function reportOutcomeEmail(input: { title: string; removed: boolean }): {
  subject: string;
  text: string;
} {
  return {
    subject: 'What we decided about the listing you reported',
    text: [
      'Hello,',
      '',
      input.removed
        ? `A person at Gaff looked at the listing “${input.title}” and removed it. Thank you for telling us.`
        : `A person at Gaff looked at the listing “${input.title}” and found it within Gaff’s listing policy, so it stays up. Thank you for telling us.`,
      '',
      'Gaff',
    ].join('\n'),
  };
}
