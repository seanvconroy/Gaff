import { describe, expect, it } from 'vitest';
import { budgetState, crossesWarning, formatUsd, monthKey, monthStart } from './budget';
import { BEDROCK_REGIONAL_PREMIUM, baseModel, costMicros } from './prices';

const tokens = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

describe('P3: the cost of an AI call', () => {
  it('prices Claude Opus 5.5 at $4 in and $20 out per million tokens', () => {
    expect(costMicros('claude-opus-5-5', { ...tokens, inputTokens: 1_000_000 }, 'anthropic')).toBe(
      4_000_000,
    );
    expect(costMicros('claude-opus-5-5', { ...tokens, outputTokens: 1000 }, 'anthropic')).toBe(
      20_000,
    );
  });

  it('prices cache reads at a twentieth of input, and cache writes at 1.25 times', () => {
    expect(costMicros('claude-opus-5-5', { ...tokens, cacheReadTokens: 1000 }, 'anthropic')).toBe(
      200,
    );
    expect(costMicros('claude-opus-5-5', { ...tokens, cacheWriteTokens: 1000 }, 'anthropic')).toBe(
      5000,
    );
  });

  it("adds Bedrock's regional premium, and reads its prefixed model IDs", () => {
    expect(baseModel('anthropic.claude-opus-5-5')).toBe('claude-opus-5-5');
    expect(
      costMicros('anthropic.claude-opus-5-5', { ...tokens, outputTokens: 1000 }, 'bedrock'),
    ).toBe(Math.ceil(20_000 * BEDROCK_REGIONAL_PREMIUM));
  });

  it('prices an unknown model as the dearest known one, never as free', () => {
    expect(costMicros('some-new-model', { ...tokens, outputTokens: 1000 }, 'anthropic')).toBe(
      20_000,
    );
  });
});

describe('P4: the monthly budget', () => {
  it('warns at 80% and pauses at 100%', () => {
    expect(budgetState(79_000_000, 100)).toBe('ok');
    expect(budgetState(80_000_000, 100)).toBe('warning');
    expect(budgetState(100_000_000, 100)).toBe('spent');
  });

  it('pauses at once when the budget is nothing', () => {
    expect(budgetState(0, 0)).toBe('spent');
  });

  it('notices only the call that crosses the warning line', () => {
    expect(crossesWarning(79_000_000, 81_000_000, 100)).toBe(true);
    expect(crossesWarning(81_000_000, 82_000_000, 100)).toBe(false);
    expect(crossesWarning(10_000_000, 11_000_000, 100)).toBe(false);
  });

  it('runs by calendar month, in UTC', () => {
    const now = new Date('2026-11-30T23:30:00Z');
    expect(monthStart(now).toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(monthKey(now)).toBe('2026-11');
  });

  it('writes dollars for the founders', () => {
    expect(formatUsd(80_123_456)).toBe('$80.12');
  });
});
