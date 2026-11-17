import type { OperatorStepKey, OperatorStepState } from '@/domain/tenancy/operator-steps';

/**
 * The words of the operator's tenancy steps (UX-TN-1 to UX-TN-4), each its own focused screen,
 * and of closing (UX-TN-5 to UX-TN-7). The tenant's side of the same steps is in `renter.ts`;
 * both read the same facts, so they always agree (UX-RN-26).
 */
export const stepNames: Record<OperatorStepKey, string> = {
  send_agreement: 'Send the agreement',
  sign_agreement: 'Sign the agreement',
  request_payment: 'Ask for the deposit and first month’s rent',
  confirm_payment: 'Mark the payment received',
  register_rtb: 'Register with the RTB',
  hand_over: 'Hand over the keys',
};

export function stateWords(state: OperatorStepState, tenantFirst: string): string {
  switch (state) {
    case 'done':
      return 'Done';
    case 'next':
      return 'Next';
    case 'open':
      return 'Ready';
    case 'waiting':
      return `With ${tenantFirst}`;
    case 'to_come':
      return 'To come';
  }
}

export const tenancyCopy = {
  overview: {
    heading: 'The tenancy, step by step',
    nothing: 'Nothing to do now.',
    waiting: (first: string) =>
      `${first} is reading the agreement. Gaff tells you when it’s signed.`,
    allDone: 'Every step is done. Finish the letting when you’re ready.',
    finish: 'Finish this letting',
    readAgreement: 'Read the agreement',
    rentPack: 'Rent-setting pack',
  },
  done: 'Back to the tenancy',
  send: {
    ownerTitle: (address: string) => `Who owns ${address}?`,
    ownerLead: 'The agreement names the landlord. Gaff asks once.',
    ownerName: 'Owner’s name',
    ownerEmail: 'Owner’s email',
    ownerSave: 'Save and continue',
    title: (first: string) => `Send the agreement to ${first}`,
    lead: (first: string) =>
      `Gaff’s standard agreement, filled in from the offer. ${first} reads and signs it on their phone, then you sign.`,
    button: (first: string) => `Send to ${first} to sign`,
    sending: 'Sending…',
    sentTitle: (first: string) => `Sent to ${first}`,
    sentText: (first: string) =>
      `Gaff emailed ${first} a link to read and sign it. Gaff tells you as soon as it’s signed, and you sign next.`,
  },
  paper: {
    summary: 'We signed on paper',
    text: (first: string) =>
      `Print the agreement, sign it with ${first}, then record it here. Keep the signed copy safe.`,
    button: 'Both sides have signed on paper',
  },
  sign: {
    title: 'Sign the agreement',
    lead: (first: string, when: string, agency: boolean) =>
      `${first} signed on ${when}. Now sign for the landlord${agency ? ', as their agent' : ''}, and you’ll both have a copy.`,
    waitingTitle: (first: string) => `Waiting for ${first} to sign`,
    waitingText: (first: string, when: string) =>
      `Sent on ${when}. Gaff tells you as soon as ${first} has signed, and you sign next.`,
    nameLabel: 'Type your full name to sign',
    nameHint: (name: string) => `Your own name: ${name}.`,
    consent: (agency: boolean) =>
      `I agree to sign this agreement electronically${agency ? ', for the landlord' : ''}`,
    consentLegend: 'Signing electronically',
    button: 'Sign the agreement',
    signing: 'Signing…',
    signedTitle: 'Signed by both sides',
    paperTitle: 'Signed on paper',
    signedText: (first: string) =>
      `${first} has a copy too. Next, ask for the deposit and first month’s rent.`,
    paperText: 'Keep the signed paper copy safe. Next, ask for the deposit and first month’s rent.',
  },
  account: {
    title: (first: string) => `Where does ${first} pay?`,
    lead: 'The account the deposit and first month’s rent go into: your own, or your client account. Gaff never handles the money, and remembers this for next time.',
    name: 'Name on the account',
    iban: 'IBAN',
    button: 'Save the account',
    saving: 'Saving…',
  },
  phone: {
    title: (first: string) => `A number ${first} can ring`,
    lead: (first: string) =>
      `Before paying, ${first} is asked to ring you and check the account. This is the number ${first} is shown.`,
    label: 'Phone number',
    hint: 'Your office, or your own. Renters see it on their pages.',
    button: 'Save the number',
  },
  request: {
    title: (first: string) => `Ask ${first} for the deposit and first month’s rent`,
    lead: (first: string) =>
      `${first} gets an email with the total, your account and the reference. Nothing else is ever asked of a tenant.`,
    deposit: 'Deposit',
    firstRent: 'First month’s rent',
    total: 'Total',
    payInto: 'Pays into',
    reference: 'Reference',
    ring: 'Number to ring',
    payBy: 'Pay by',
    button: (first: string) => `Ask ${first} to pay`,
    sending: 'Sending…',
    sentTitle: (first: string) => `Asked ${first} to pay`,
    sentText: (first: string, total: string, by: string, reference: string) =>
      `${total} by ${by}, with the reference ${reference}. When it’s in your account, mark it received.`,
  },
  received: {
    title: (first: string) => `Has ${first}’s payment arrived?`,
    lead: (total: string, reference: string, by: string) =>
      `${total} with the reference ${reference}, asked for by ${by}. Check your account first.`,
    button: 'It’s in our account',
    saving: 'Saving…',
    doneTitle: 'Payment received',
    doneText: (first: string) => `${first} has a receipt. Next, register the tenancy with the RTB.`,
  },
  rtb: {
    title: 'Register with the RTB',
    lead: (by: string) =>
      `Register by ${by}: one month from the start. Copy each detail into the RTB’s form.`,
    labels: {
      home: 'Home',
      bedrooms: 'Bedrooms',
      start: 'Tenancy start',
      rent: 'Rent a month',
      deposit: 'Deposit',
      landlord: 'Landlord',
      agent: 'Agent',
      licence: 'PSRA licence',
      tenant: 'Tenant',
      email: 'Tenant’s email',
      phone: 'Tenant’s phone',
      ppsn: 'Tenant’s PPS number',
    },
    notGiven: 'Not given',
    ppsnHidden: 'Hidden',
    ppsnNotGiven: 'Not given. It’s optional.',
    ppsnDeleted: 'Deleted after registration',
    show: 'Show',
    showWhat: 'the tenant’s PPS number',
    openRtb: 'Open the RTB’s website',
    reference: 'RTB registration number',
    referenceHint: 'If you have it.',
    button: 'I’ve registered it',
    saving: 'Saving…',
    back: 'Back to the letting',
    doneTitle: 'Registered with the RTB',
    doneText: (when: string, reference: string | null) =>
      `On ${when}${reference ? `, number ${reference}` : ''}. The tenant’s PPS number is deleted.`,
  },
  moveIn: {
    title: 'Hand over the keys',
    lead: (first: string) =>
      `The checklist for the day, and the inventory. ${first} checks the inventory on their phone.`,
    checklist: 'On the day',
    electricity: 'Electricity meter reading',
    gas: 'Gas meter reading',
    inventory: 'Inventory',
    noItems: 'Nothing in the inventory yet. Add each room’s main items, one at a time.',
    addItem: 'Add an item',
    remove: 'Remove',
    save: 'Save the checklist',
    share: (first: string) => `Save and share with ${first}`,
    saving: 'Saving…',
    shared: (first: string, when: string) =>
      `Shared with ${first} on ${when}. Gaff tells you when it’s confirmed as a fair record.`,
    confirmed: (first: string, when: string) => `${first} confirmed it’s a fair record on ${when}.`,
    tenantSays: 'The tenant says something’s not right',
    doneTitle: 'Keys handed over',
    doneText: (first: string) =>
      `The inventory is with ${first}. When every step is done, finish the letting.`,
  },
  item: {
    title: 'Add to the inventory',
    lead: 'One item at a time: where it is, what it is, and how it looks.',
    room: 'Room',
    roomHint: 'Like Kitchen or Bedroom 1',
    item: 'Item',
    itemHint: 'Like Fridge or Wardrobe',
    condition: 'Condition',
    conditionHelp: { good: 'No marks or faults', fair: 'Some wear', poor: 'Damaged or worn out' },
    note: 'Note',
    photo: 'Photo',
    photoHint: 'Take one or choose one. Location and camera details are removed.',
    button: 'Add to the inventory',
    adding: 'Adding…',
    added: (what: string, count: number) =>
      `Added ${what}. ${count === 1 ? '1 item' : `${count} items`} so far. Add the next one, or go back.`,
    back: 'Done',
  },
  finish: {
    title: 'Finish this letting',
    lead: (address: string) =>
      `${address} is let. Finishing archives the letting and starts the clock on deleting the tenant’s details.`,
    done: 'Done',
    open: 'Still open',
    agreement: 'Agreement signed',
    payment: 'Payment received',
    rtb: 'Registered with the RTB',
    keys: 'Keys handed over',
    rtbOpen: 'Register first if you can: the details for the RTB go when the tenant’s do.',
    notYet: 'You can finish once the agreement is signed and the payment is in.',
    save: (days: number) =>
      `Save the signed agreement and the packs first. Gaff deletes the tenant’s details ${days} days after you finish.`,
    button: 'Finish',
    finishing: 'Finishing…',
  },
  usual: {
    daysTitle: 'Before Gaff, how long did a letting usually take?',
    daysLead: 'From the first enquiry to a signed agreement. Gaff compares your lettings with it.',
    hoursTitle: 'And how many hours of your own time?',
    hoursLead: 'Roughly, for one letting. Gaff counts only the minutes you spend in it.',
    button: 'Continue',
    progress: 'Your usual',
    daysStep: 'How long',
    hoursStep: 'Your time',
  },
  let: {
    title: (address: string) => `${address} is let`,
    deletes: (date: string) => `The other applicants’ details are deleted from Gaff by ${date}.`,
    next: {
      send_owner_summary: (owner: string | null) =>
        owner ? `Send ${owner} the summary` : 'Send the owner the summary',
      invite_colleague: 'Invite a colleague',
      add_letting: 'Add your next letting',
    },
  },
} as const;
