/**
 * UX-NV-6: a focused task opens full screen, and closing it returns the user to where they
 * started. The page that opens a task says where that is, in the link (`?from=/today`). Only a
 * plain path inside Gaff is accepted: letters, digits, hyphens and slashes. Anything else, such
 * as another site's address, is ignored, and the task's own starting place is used.
 */
const PLAIN_PATH = /^(\/[A-Za-z0-9-]+)+$/;

export function returnPath(from: string | string[] | undefined, fallback: string): string {
  return typeof from === 'string' && PLAIN_PATH.test(from) ? from : fallback;
}

/** The link that opens a task from a page, so closing it comes back to that page. */
export function withReturn(task: string, from: string): string {
  return `${task}?from=${encodeURIComponent(from)}`;
}
