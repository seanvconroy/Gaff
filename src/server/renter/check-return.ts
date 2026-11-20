/**
 * UX-RN-17: a renter can leave between checks and come back to the next one. The ID and income
 * providers are never given the renter's private link, so the page they send the renter back to
 * (/checks/done) can't know whose it is. The browser that started the check remembers the way
 * back instead: an HTTP-only cookie holding the link's own token, for an hour. It holds nothing
 * the browser didn't already have in its address bar.
 */
export const CHECK_RETURN_COOKIE = 'gaff_check_return';
export const CHECK_RETURN_MINUTES = 60;

/** The way back, if the cookie holds a link's token and nothing else. */
export function checkReturnPath(cookie: string | undefined): string | null {
  return cookie && /^[A-Za-z0-9_-]{43}$/.test(cookie) ? `/r/${cookie}` : null;
}
