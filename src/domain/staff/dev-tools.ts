/**
 * BA-1 (ADR-0010): who may open the development tools: the outbox, the test inbox, the stand-in
 * checks, and anything else under /dev that shows or changes something.
 *
 * - Off (`DEV_TOOLS` unset or 0, and always in production): nobody. Every page is "not found".
 * - Where every email lands in the outbox (local development, the test environments): whoever
 *   runs Gaff, as before. Nothing real is in it.
 * - Where email is really sent (the test copy on its public address): Gaff's own team only. The
 *   outbox holds made-up people's mail and sign-in codes, and the test inbox can write to any
 *   letting, so a stranger gets "not found", signed in or not.
 */
export type DevToolsAccess = 'nobody' | 'anyone' | 'staff';

export function devToolsAccess(input: { devTools: boolean; realEmail: boolean }): DevToolsAccess {
  if (!input.devTools) return 'nobody';
  return input.realEmail ? 'staff' : 'anyone';
}
