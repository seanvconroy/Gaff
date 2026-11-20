/**
 * M119, M132, M133: no map for search engines' robots, link previews and scripts. Their visits
 * aren't renters', so they get the list alone: Google's script never loads for them, no map
 * load is billed, and the map's counts leave them out. A guess from the user agent, which is
 * read and let go: it's never stored.
 */

const BOT =
  /bot|crawl|spider|slurp|preview|fetch|monitor|headless|lighthouse|python-requests|curl|wget|httpclient|axios|node-fetch|go-http-client|java\/|facebookexternalhit|whatsapp|embedly|pinterest|vkshare|w3c_validator/i;

export function isLikelyBot(userAgent: string | null | undefined): boolean {
  if (!userAgent || userAgent.length < 10) return true;
  return BOT.test(userAgent);
}
