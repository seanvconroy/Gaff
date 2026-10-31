import { advertIdFromUrl, type ParsedEnquiry } from './parse';

/** Lowercase words without accents or punctuation, padded so we only match whole words. */
function words(text: string): string {
  const plain = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return ` ${plain} `;
}

/**
 * R6: which of the operator's homes an enquiry is about: by the advert's ID first (the link
 * the operator added at set-up), then by the address. Only a single clear match counts;
 * anything else waits for the operator.
 */
export function matchLetting(
  enquiry: Pick<ParsedEnquiry, 'advertId' | 'addressHint'>,
  subject: string,
  lettings: ReadonlyArray<{
    id: string;
    addressLine1: string;
    daftUrl: string | null;
    myhomeUrl: string | null;
  }>,
): string | null {
  if (enquiry.advertId) {
    const byAdvert = lettings.filter((letting) =>
      [letting.daftUrl, letting.myhomeUrl].some(
        (url) => url && advertIdFromUrl(url) === enquiry.advertId,
      ),
    );
    if (byAdvert.length === 1) return byAdvert[0]!.id;
  }
  const haystack = words(`${enquiry.addressHint ?? ''} ${subject}`);
  const byAddress = lettings.filter((letting) => haystack.includes(words(letting.addressLine1)));
  return byAddress.length === 1 ? byAddress[0]!.id : null;
}

/** R6: the same renter enquiring twice (say on Daft and on MyHome) is one application. */
export function isSameRenter(
  a: { emailNormalised: string; phoneE164: string | null },
  b: { emailNormalised: string; phoneE164: string | null },
): boolean {
  return (
    a.emailNormalised === b.emailNormalised || (a.phoneE164 !== null && a.phoneE164 === b.phoneE164)
  );
}
