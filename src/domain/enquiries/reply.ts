/**
 * The new part of a renter's email reply, without the quoted conversation underneath.
 * "On Tue, 4 Nov 2026 at 09:12, Halcyon Lettings wrote:" and "> quoted" lines end it.
 */
export function stripQuotedReply(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const kept: string[] = [];
  for (const line of lines) {
    if (/^\s*>/.test(line)) break;
    if (/^\s*On .+wrote:\s*$/i.test(line)) break;
    if (/^\s*-{2,}\s*Original Message\s*-{2,}/i.test(line)) break;
    if (/^\s*From:\s.+/i.test(line) && kept.length > 0) break;
    kept.push(line);
  }
  return kept.join('\n').trim();
}
