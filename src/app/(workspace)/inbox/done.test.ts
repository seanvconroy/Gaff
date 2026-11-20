import { describe, expect, it } from 'vitest';
import { doneMessage, doneNote } from './done';

describe('UX-NV-14: what Inbox says once something is done', () => {
  it('carries a code and a mark of when in the address, and never the words', () => {
    const note = doneNote('sent', new Date('2026-11-16T12:00:00Z'));
    expect(note).toMatch(/^sent\.[0-9a-z]+$/);
    expect(doneMessage(note)).toBe('Sent');
    expect(doneNote('sent', new Date('2026-11-16T12:00:01Z'))).not.toBe(note);
  });

  it('says nothing for a code it doesn’t know, whatever the address holds', () => {
    for (const note of [undefined, '', 'toString', 'constructor.1', 'Sent', '<b>hi</b>']) {
      expect(doneMessage(note)).toBeNull();
    }
    expect(doneMessage('set-aside')).toBe('Set aside');
  });
});
