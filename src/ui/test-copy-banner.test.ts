import { describe, expect, it } from 'vitest';
import { isTestCopy } from './TestCopyBanner';

describe('BA-1: the test copy’s banner', () => {
  it('is shown on the test copy alone', () => {
    expect(isTestCopy('staging')).toBe(true);
    for (const gaffEnv of ['development', 'test', 'production', undefined]) {
      expect(isTestCopy(gaffEnv), String(gaffEnv)).toBe(false);
    }
  });
});
