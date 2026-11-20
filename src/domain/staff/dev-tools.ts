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

/**
 * BA-6: the one exception, the stand-in ID and income check page (/dev/checks/<id>). Where the
 * stand-in is the provider on the test copy, any tester must be able to pass their own check, as
 * they would with a real provider. So the person the check belongs to may open that one check's
 * page through the link the stand-in sent them to (`ownLink`: its key matches the check), and
 * nothing else under /dev. Anyone else gets the development tools' usual rule.
 */
export function standInCheckAccess(input: {
  devTools: boolean;
  realEmail: boolean;
  ownLink: boolean;
}): DevToolsAccess {
  const access = devToolsAccess(input);
  return access === 'staff' && input.ownLink ? 'anyone' : access;
}
