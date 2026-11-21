import { describe, expect, it } from 'vitest';
import { TEST_COPY_OUTBOX } from './test-copy';

describe('BA-1: what the test copy tells testers is real', () => {
  it('says where texts are: in the outbox, or on real phones', () => {
    expect(TEST_COPY_OUTBOX.lead).toContain('and every text');
    expect(TEST_COPY_OUTBOX.leadWithRealTexts).toContain('texts go to real phones');
    expect(TEST_COPY_OUTBOX.leadWithRealTexts).not.toContain('and every text');
  });
});
