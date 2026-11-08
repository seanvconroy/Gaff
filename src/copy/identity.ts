/**
 * P17 to P20 (Q48): the words people see about their identity check, renters and letters alike.
 * Plain, and with an equal choice of checking without a selfie (P18).
 */

export const identityExplained = {
  how: 'You take a photo of your passport, driving licence or national ID card, and a selfie. Stripe, our checking partner, compares the selfie with the photo on your ID. It takes about two minutes on a phone.',
  biometric:
    'A selfie compared with your ID is biometric data, so we ask you first. Stripe deletes the photos for Gaff 30 days after the check. Gaff keeps only the result, your name and the date: never your photos, your date of birth or your document number.',
  once: 'You do this once. It stays on your Gaff profile for every home after this one.',
  consent: 'I agree to Stripe comparing my selfie with the photo on my ID',
  withoutSelfie: {
    renter:
      'You can check your ID without a selfie instead: Stripe checks the document alone. It counts the same, and the letter asks to see your ID when you meet.',
    letter:
      'You can check your ID without a selfie instead: Stripe checks the document alone. A person at Gaff then looks at your first listing before it goes live.',
  },
  offline: {
    renter:
      'If your ID isn’t a passport, driving licence or national ID card, or Stripe can’t read it, choose “My ID can’t be checked online”. You can carry on straight away, and the letter sees your ID when you meet.',
    letter:
      'If your ID isn’t a passport, driving licence or national ID card, or Stripe can’t read it, choose “My ID can’t be checked online”. A person at Gaff will contact you within one working day to check it another way.',
  },
} as const;

export const identityReasonWords: Record<string, string> = {
  document: 'The check couldn’t confirm your ID document. Try again with another one.',
  face_mismatch: 'The selfie didn’t match the photo on your ID. Try again in good light.',
  gave_up: 'The check wasn’t finished. You can start it again.',
};
