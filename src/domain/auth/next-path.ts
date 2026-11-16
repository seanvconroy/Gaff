/**
 * UX-SI-8: where to go after signing in. A destination can be handed to sign-in (`?next=`), and
 * anyone can write a link with one, so only a path on this site is ever followed: never another
 * site, a sign-in page, an API address or a development page.
 */

const ORIGIN = 'https://gaff.invalid';
const NOT_A_DESTINATION = /^\/(sign-in|api|dev)(\/|$)/;

/** The path to go to, or null if what was given isn't a safe path on this site. */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) return null;
  // One leading slash: "//host" and "/\host" are other sites to a browser.
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  // No backslashes, spaces or control characters, typed or encoded.
  if (/[\\\s\u0000-\u001f\u007f]/.test(value) || /%(0[0-9a-f]|1[0-9a-f]|5c|7f)/i.test(value)) {
    return null;
  }
  // Rule 8: no email address in a URL.
  if (/@|%40/i.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value, ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== ORIGIN) return null;
  if (NOT_A_DESTINATION.test(url.pathname)) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** The sign-in screen's address, coming back to `next` afterwards if it's a safe path. */
export function signInPath(next?: unknown): string {
  const path = safeNextPath(next);
  return path && path !== '/' ? `/sign-in?next=${encodeURIComponent(path)}` : '/sign-in';
}
