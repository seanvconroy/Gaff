/**
 * M79: where each home is at, in the renter's words, and what happens next. Renters who aren't
 * chosen are told plainly and kindly, never as a failure.
 */
export function stageWords(
  status: string | null,
  letterName: string,
): { stage: string; next: string } {
  switch (status) {
    case 'enquired':
      return {
        stage: 'Enquiry sent',
        next: `${letterName} decides who views. You’ll hear back either way.`,
      };
    case 'invited':
      return {
        stage: 'Invited to view',
        next: 'Choose a viewing time on your page for this home.',
      };
    case 'waitlisted':
      return {
        stage: 'On the waiting list for a viewing',
        next: 'If a place frees up, you’ll be offered it by email.',
      };
    case 'not_invited':
      return {
        stage: 'Not invited to view this time',
        next: 'Other homes on Gaff might suit you better.',
      };
    case 'booked':
      return { stage: 'Viewing booked', next: 'Your page for this home has the time and address.' };
    case 'attended':
      return {
        stage: 'You viewed the home',
        next: 'If you’d like it, apply on your page for this home.',
      };
    case 'no_show':
      return { stage: 'You missed the viewing', next: `You can write to ${letterName} below.` };
    case 'applied':
      return {
        stage: 'Applied',
        next: `${letterName} decides who is offered the home. You’ll hear back either way.`,
      };
    case 'preferred':
    case 'backup':
      return {
        stage: 'Chosen: a few checks to do',
        next: 'Your page for this home lists the checks. They’re free.',
      };
    case 'offered':
      return { stage: 'Offered the home', next: 'Accept or decline on your page for this home.' };
    case 'accepted':
      return {
        stage: 'You accepted the home',
        next: 'Your page for this home has the agreement and the next steps.',
      };
    case 'declined':
      return { stage: 'You declined the offer', next: 'Nothing more to do for this home.' };
    case 'not_chosen':
      return {
        stage: 'The home went to someone else',
        next: 'Thank you for your interest. Other homes on Gaff might suit you.',
      };
    case 'withdrawn':
      return { stage: 'You withdrew your enquiry', next: 'Nothing more to do for this home.' };
    default:
      return { stage: 'Closed', next: 'Your details for this home have been deleted.' };
  }
}
