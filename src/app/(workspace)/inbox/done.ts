/**
 * What Inbox says, in a toast, once something a person did is done. The address carries a code,
 * never the words, and nothing about anyone.
 */
export const doneWords = {
  sent: 'Sent',
  'not-sent': 'Not sent',
  'set-aside': 'Set aside',
  matched: 'Matched. Gaff is answering it now.',
} as const;

export type DoneCode = keyof typeof doneWords;

/**
 * The note of what was done, as the address carries it: the code, and a mark of when, so that
 * sending twice in a row from one conversation is said twice.
 */
export function doneNote(code: DoneCode, at: Date = new Date()): string {
  return `${code}.${at.getTime().toString(36)}`;
}

export function doneMessage(note: string | undefined): string | null {
  const code = note?.split('.')[0];
  return code && Object.hasOwn(doneWords, code) ? doneWords[code as DoneCode] : null;
}
