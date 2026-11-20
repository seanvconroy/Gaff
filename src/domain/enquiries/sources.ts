/**
 * UX-AV-8, R6: where an enquiry came from. One person in a letting can have come from more than
 * one: someone who enquired on Daft and then pressed "Ask to view" on Gaff is one person, whose
 * row shows both. The source is a code; it says nothing about the person.
 */
export const enquirySources = ['gaff', 'daft', 'myhome'] as const;
export type EnquirySource = (typeof enquirySources)[number];

const names: Record<EnquirySource, string> = { gaff: 'Gaff', daft: 'Daft', myhome: 'MyHome' };

export function isEnquirySource(value: string): value is EnquirySource {
  return (enquirySources as readonly string[]).includes(value);
}

/** "Gaff", "Daft", "MyHome". */
export function sourceName(source: EnquirySource): string {
  return names[source];
}

/** A person's sources in a fixed order, in words: "Gaff and Daft". Unknown codes are left out. */
export function sourcesInWords(sources: readonly string[]): string {
  const known = enquirySources.filter((source) => sources.includes(source)).map(sourceName);
  if (known.length <= 1) return known[0] ?? '';
  return `${known.slice(0, -1).join(', ')} and ${known.at(-1)}`;
}

/** The sources after one more enquiry: each once. */
export function withSource(sources: readonly string[], source: EnquirySource): EnquirySource[] {
  return enquirySources.filter((each) => each === source || sources.includes(each));
}
