/**
 * P17, P18 (Q48, Q60): the words people see about their identity check, renters and letters
 * alike. One standard: a photo ID and a live selfie, with no other way through.
 */

export const identityExplained = {
  how: 'You take a photo of your passport, driving licence or national ID card, and a selfie. Stripe, our checking partner, compares the selfie with the photo on your ID, so we know it’s really you. It takes about two minutes on a phone.',
  biometric:
    'A selfie compared with your ID is biometric data, so we ask you first. Stripe deletes the photos for Gaff 30 days after the check. Gaff keeps only the result, your name and the date: never your photos, your date of birth or your document number.',
  once: 'You do this once. It stays on your Gaff profile for every home after this one.',
  consent:
    'By pressing the button, you agree to Stripe comparing your selfie with the photo on your ID.',
  noTriesLeft:
    'Stripe couldn’t check your ID in three tries. Reply to any email from us, and a person at Gaff will give you more tries.',
} as const;

export const identityReasonWords: Record<string, string> = {
  document: 'The check couldn’t confirm your ID document. Try again with another one.',
  face_mismatch: 'The selfie didn’t match the photo on your ID. Try again in good light.',
  gave_up: 'The check wasn’t finished. You can start it again.',
};
