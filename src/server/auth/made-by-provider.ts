/**
 * People just made by a sign-in that brought Google or Apple with it, so that the provider being
 * there from the start isn't also news of a change to tell them about (AU11). Remembered for a
 * minute, in this process: the account's own hook asks straight after the person is made.
 */
const madeByProvider = new Map<string, number>();

export function rememberMadeByProvider(userId: string): void {
  const now = Date.now();
  for (const [id, at] of madeByProvider) if (now - at > 60_000) madeByProvider.delete(id);
  madeByProvider.set(userId, now);
}

export function wasMadeByProvider(userId: string): boolean {
  return madeByProvider.has(userId);
}
