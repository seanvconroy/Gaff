/**
 * The words of Settings (UX-ST-1 to UX-ST-3): a list of rows, each a page with one subject and
 * one save button. UX-ST-2, UX-AI-14: the assistant's one switch is called "Check Gaff's answers
 * before they go".
 */
export const settingsCopy = {
  title: 'Settings',
  lead: 'Where enquiries come in, how Gaff answers them, and the rules you use for every letting.',
  noRows: 'Only an admin can change these settings. Ask an admin in your agency.',
  saved: 'Saved.',
  back: 'Settings',
  adminOnly: 'Only an admin can change that.',
  rows: {
    enquiries: 'Enquiries',
    assistant: 'The assistant',
    income: 'Income rule',
    payment: 'Where tenants pay',
    agency: 'The agency',
    team: 'Team',
  },
  team: { row: 'Who’s in your team, and who’s been invited.' },
  enquiries: {
    title: 'Enquiries',
    lead: 'Send your Daft and MyHome enquiries to your Gaff address, and Gaff answers every one.',
    address: 'Your Gaff address',
    matching:
      'Gaff matches each enquiry to a home using the advert links on the letting. Anything it can’t match waits for you in Inbox.',
    what: 'your Gaff address',
  },
  assistant: {
    title: 'The assistant',
    lead: 'Gaff answers renters’ questions from each home’s facts, and only from them.',
    switch: 'Check Gaff’s answers before they go',
    on: 'On',
    onHelp: 'Each answer Gaff writes waits for you in Inbox, and goes once you’ve checked it.',
    off: 'Off',
    offHelp: 'Answers from the home’s facts go straight out. Anything else still comes to you.',
    fixed: 'Fixed messages, like first replies, invitations and reminders, always go straight out.',
    button: 'Save',
    rowOn: 'Checking Gaff’s answers before they go',
    rowOff: 'Answers go straight out',
  },
  income: {
    title: 'Income rule',
    lead: 'The take-home income you look for, compared with the rent. It’s the same for everyone, and renters see it before they apply. Housing support, such as HAP, always counts as income. A renter below the rule isn’t turned away: you decide.',
    legend: 'Take-home income of at least',
    choice: (ratio: string) => `${ratio} times the rent`,
    button: 'Save income rule',
  },
  payment: {
    title: 'Where tenants pay',
    lead: 'The account a new tenant pays the deposit and first month’s rent into: your own, or your client account. Gaff never handles the money. Tenants see these details only on their private page, and are asked to ring you and check them.',
  },
  agency: {
    title: 'The agency',
    lead: 'What renters see about you, and the number they can ring.',
    name: 'Name renters see',
    licence: 'PSRA licence',
    status: 'Status',
    confirmed: 'Confirmed',
    beingConfirmed: 'Being confirmed',
    notGiven: 'Not given',
    phone: 'Number renters can ring',
    phoneHint:
      'Your office number. Renters see it on their pages, and ring it to check where to pay.',
    button: 'Save the number',
  },
} as const;
