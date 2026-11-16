import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MESSAGES_WRITTEN_AT, writtenMessages, writtenSms } from '../fixtures/messages';

/**
 * UX-AI-10, UX-PP-10 (product rule 7): first replies, invitations, reminders, offers, outcomes
 * and check messages are fixed wording that a solicitor reviews. The redesign changes how an
 * email is laid out, never what it says.
 *
 * These words were pinned before the email layout was built (work package WP-6). If a test here
 * fails, a template's words have changed: that is a decision for the solicitor, never a side
 * effect. Update the snapshot and the fingerprint only once the new wording is agreed.
 */
describe('Compliance: the words of every fixed message', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MESSAGES_WRITTEN_AT);
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('UX-AI-10: every template’s subject and text are exactly what they were', () => {
    for (const message of writtenMessages()) {
      expect(`Subject: ${message.subject}\n\n${message.body}`).toMatchSnapshot(message.name);
    }
  });

  it('UX-AI-10: the text reminder is exactly what it was', () => {
    expect(writtenSms()).toMatchSnapshot('text reminder');
  });

  it('UX-AI-10: nothing is added, dropped or reworded anywhere (one fingerprint of them all)', () => {
    const all = [
      ...writtenMessages().map((m) => `${m.name}\n${m.subject}\n${m.body}`),
      writtenSms(),
    ].join('\n\u0000\n');
    // A deleted snapshot file would be written afresh; this can't be.
    expect(createHash('sha256').update(all).digest('hex')).toBe(
      '21e68376ed2c67fe2099d35a7d715364580ded7a0654c75b985b1a433e081e3f',
    );
  });
});
