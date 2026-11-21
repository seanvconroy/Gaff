import { describe, expect, it } from 'vitest';
import { TEST_COPY_BANNER, TEST_COPY_OUTBOX } from './test-copy';

describe('BA-1: what the test copy tells testers is real', () => {
  it('asks for made-up numbers while texts are stand-ins', () => {
    expect(TEST_COPY_BANNER.body).toBe(
      'Use made-up names, numbers and homes. Emails are real; texts and ID checks are stand-ins.',
    );
  });

  it('UX-SI-13: asks for the tester’s own mobile once texts are real, so no stranger is texted', () => {
    expect(TEST_COPY_BANNER.bodyWithRealTexts).toBe(
      'Use made-up names and homes, and your own mobile number. Emails and texts are real; ID checks are stand-ins.',
    );
    expect(TEST_COPY_BANNER.bodyWithRealTexts).not.toMatch(/made-up [^.]*numbers/);
  });

  it('says where texts are: in the outbox, or on real phones', () => {
    expect(TEST_COPY_OUTBOX.lead).toContain('and every text');
    expect(TEST_COPY_OUTBOX.leadWithRealTexts).toContain('texts go to real phones');
    expect(TEST_COPY_OUTBOX.leadWithRealTexts).not.toContain('and every text');
  });
});
