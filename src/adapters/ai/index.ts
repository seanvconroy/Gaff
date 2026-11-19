import { env } from '@/lib/env';
import type { AiProvider } from '@/ports/ai';
import { claudeProvider } from './claude';
import { bedrockClient, claudeApiClient } from './clients';
import { fakeAi } from './fake';

let cached: AiProvider | undefined;

/**
 * The one AI provider, for every task (ADR-0017; the live line's Q37): the Claude API on the
 * test copy and in development, Claude on Bedrock in the EU in production (production refuses
 * anything else), and the stand-in for tests. Use it through `runAi` (src/server/ai/usage.ts).
 */
export function aiProvider(): AiProvider {
  if (cached) return cached;
  const config = env();
  switch (config.AI_PROVIDER) {
    case 'anthropic':
      cached = claudeProvider({
        name: 'anthropic',
        client: claudeApiClient(config.ANTHROPIC_API_KEY!),
        model: config.AI_MODEL,
      });
      break;
    case 'bedrock':
      cached = claudeProvider({
        name: 'bedrock',
        client: bedrockClient(config.AWS_REGION),
        model: config.AI_MODEL,
      });
      break;
    default:
      cached = fakeAi;
  }
  return cached;
}

/** Tests swap the provider for a scripted one, then put the configured one back. */
export function setAiProviderForTests(provider: AiProvider | undefined): void {
  cached = provider;
}
