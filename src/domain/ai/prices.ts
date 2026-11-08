/**
 * P3, P4: what an AI call cost, worked out from its token counts, in millionths of a US dollar
 * (both providers bill in dollars). Estimates for the budget, not an invoice.
 */

export interface TokenCounts {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** Dollars per million tokens. Cache writes (five minutes) cost 1.25 times the input price. */
interface Price {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

const prices: Record<string, Price> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
};

/** Bedrock's in-region endpoint costs about 10% more than the global one (ADR-0025). */
export const BEDROCK_REGIONAL_PREMIUM = 1.1;

/** The model a price is kept for: Bedrock IDs carry an "anthropic." prefix. */
export function baseModel(model: string): string {
  return model.replace(/^anthropic\./, '');
}

/**
 * The cost of one call, in millionths of a dollar, rounded up. An unknown model is priced as
 * the dearest one we know, so a budget is never under-counted.
 */
export function costMicros(model: string, tokens: TokenCounts, provider: string): number {
  const price =
    prices[baseModel(model)] ??
    Object.values(prices).reduce((a, b) => (a.output >= b.output ? a : b));
  // Price per million tokens times tokens, divided by a million, in millionths: the two cancel.
  const dollarsTimesMillion =
    tokens.inputTokens * price.input +
    tokens.outputTokens * price.output +
    tokens.cacheReadTokens * price.cacheRead +
    tokens.cacheWriteTokens * price.cacheWrite;
  const premium = provider === 'bedrock' ? BEDROCK_REGIONAL_PREMIUM : 1;
  return Math.ceil(dollarsTimesMillion * premium);
}
