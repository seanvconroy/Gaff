/**
 * Measurement (tech spec): listing views are counted without cookies, and known bots aren't
 * counted. Only the totals are kept (M92), and no view count is ever shown publicly (M72).
 */

const BOT =
  /bot|crawl|spider|slurp|preview|fetch|monitor|headless|lighthouse|python-requests|curl|wget|httpclient|axios|node-fetch|go-http-client|java\/|facebookexternalhit|whatsapp|embedly|pinterest|vkshare|w3c_validator/i;

export function isLikelyBot(userAgent: string | null | undefined): boolean {
  if (!userAgent || userAgent.length < 10) return true;
  return BOT.test(userAgent);
}
