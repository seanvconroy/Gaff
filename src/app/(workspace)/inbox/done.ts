/**
 * What Inbox says, in a toast, once something a person did is done. The address carries the
 * code, never the words, and nothing about anyone.
 */
export const doneWords = {
  sent: 'Sent',
  'not-sent': 'Not sent',
  'set-aside': 'Set aside',
  matched: 'Matched. Gaff is answering it now.',
} as const;

export type DoneCode = keyof typeof doneWords;

export function doneMessage(code: string | undefined): string | null {
  return code && code in doneWords ? doneWords[code as DoneCode] : null;
}
