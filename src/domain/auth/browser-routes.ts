/**
 * AU12 (ADR-0028): the sign-in library's routes that a browser may call directly.
 *
 * Gaff's forms are server actions, which call the library from Gaff's own server code. That's
 * where a form's rules, its security emails and its events are. So a browser needs very few of
 * the library's routes for itself: coming back from Google or Apple, and passkeys, which only
 * the browser can do. Every other route is answered as if it weren't there when it's called
 * over HTTP, including any route a later version of the library adds.
 */
const open = new Set([
  // Passkeys: the browser asks for a challenge, and sends back what the device signed.
  '/passkey/generate-authenticate-options',
  '/passkey/verify-authentication',
  '/passkey/generate-register-options',
  '/passkey/verify-registration',
  // The library's browser client reads who's signed in after a passkey sign-in.
  '/get-session',
  // The library's own "is it up" and error pages.
  '/ok',
  '/error',
]);

export function openToBrowsers(path: string): boolean {
  // Coming back from Google or Apple: the route is "/callback/:id", or the path with its name.
  return open.has(path) || /^\/callback\/[^/]+$/.test(path);
}
