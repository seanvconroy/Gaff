/** Email to operators. Plain, warm and short, like everything Gaff writes. */

/** R24: the RTB registration deadline is close, and the tenancy isn't marked registered yet. */
export function rtbReminderEmail(input: {
  address: string;
  deadline: string;
  tenancyUrl: string;
}): { subject: string; text: string } {
  return {
    subject: `Register ${input.address} with the RTB by ${input.deadline}`,
    text: [
      'Hello,',
      '',
      `The tenancy at ${input.address} needs to be registered with the Residential Tenancies Board by ${input.deadline}. The RTB registration pack has the details you need:`,
      '',
      input.tenancyUrl,
      '',
      'Once it’s done, mark it as registered in Gaff, and the tenant’s PPS number is deleted.',
      '',
      'Gaff',
    ].join('\n'),
  };
}
